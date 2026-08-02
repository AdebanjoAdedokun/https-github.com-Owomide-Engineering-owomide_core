package integration_test

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"strconv"
	"strings"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"

	commonv1 "github.com/owomide/proto/common/v1"
	intelligencepb "github.com/owomide/proto/services/intelligence/v1"
	marginpb "github.com/owomide/proto/services/margin/v1"

	"github.com/owomide/margin/internal/domain"
	"github.com/owomide/margin/internal/handler"
	"github.com/owomide/margin/internal/repo"
)

// Unique org IDs per validate-batch test to prevent cross-test rule bleed
// (all tests share one Postgres instance).
const (
	orgClean       = "00000000-0000-0000-0000-000000000010"
	orgBlocked     = "00000000-0000-0000-0000-000000000020"
	orgCurrency    = "00000000-0000-0000-0000-000000000030"
	orgNoRule      = "00000000-0000-0000-0000-000000000040"
	orgPrecA       = "00000000-0000-0000-0000-000000000060"
	orgRLSA        = "00000000-0000-0000-0000-000000000070"
	orgRLSB        = "00000000-0000-0000-0000-000000000080"
	orgUnavailable = "00000000-0000-0000-0000-000000000090"
	orgMalformed   = "00000000-0000-0000-0000-000000000091"
	createdBy      = "00000000-0000-0000-0000-000000000011"
)

// stubCostFetcher satisfies client.CostFetcher for tests without a real Catalog service.
type stubCostFetcher struct {
	costs map[string]*commonv1.Money // keyed by sku_id
}

type stubMarginEvaluator struct {
	response *intelligencepb.EvaluateMarginBatchResponse
	err      error
}

func (s *stubMarginEvaluator) EvaluateMargin(
	_ context.Context,
	_ string,
	rules []*repo.MarginRuleRow,
	items []*marginpb.ValidateItem,
	costs map[string]*commonv1.Money,
) (*intelligencepb.EvaluateMarginBatchResponse, error) {
	if s.err != nil || s.response != nil {
		return s.response, s.err
	}
	response := &intelligencepb.EvaluateMarginBatchResponse{EngineVersion: "test-engine-v1"}
	for index, item := range items {
		result := &intelligencepb.MarginEvaluationResult{
			ItemId:         strconv.Itoa(index),
			ProposedPrice:  item.ProposedPrice,
			EvaluationHash: strings.Repeat("a", 64),
			Status:         intelligencepb.MarginEvaluationStatus_MARGIN_EVALUATION_STATUS_NO_MATCH,
		}
		matched := domain.FindBestRule(item.SkuId, item.ChannelId, rules)
		if matched == nil {
			response.Results = append(response.Results, result)
			continue
		}
		result.AppliedRuleId = &matched.ID
		result.AppliedRuleVersion = &matched.Version
		result.MatchedRuleIds = []string{matched.ID}
		if item.ProposedPrice.Currency != matched.Currency {
			code := "CURRENCY_MISMATCH"
			message := "rule and proposed price currencies do not match"
			result.Status = intelligencepb.MarginEvaluationStatus_MARGIN_EVALUATION_STATUS_ERROR
			result.ErrorCode = &code
			result.ErrorMessage = &message
			response.Results = append(response.Results, result)
			continue
		}
		floor, err := domain.ComputeFloor(matched, costs[item.SkuId])
		if err != nil {
			code := "EVALUATION_ERROR"
			if errors.Is(err, domain.ErrNoCost) {
				code = "COST_REQUIRED"
			}
			message := err.Error()
			result.Status = intelligencepb.MarginEvaluationStatus_MARGIN_EVALUATION_STATUS_ERROR
			result.ErrorCode = &code
			result.ErrorMessage = &message
			response.Results = append(response.Results, result)
			continue
		}
		gap := floor - item.ProposedPrice.Amount
		result.Status = intelligencepb.MarginEvaluationStatus_MARGIN_EVALUATION_STATUS_MATCHED
		result.Floor = &commonv1.Money{Amount: floor, Currency: matched.Currency}
		result.Gap = &commonv1.Money{Currency: matched.Currency}
		if gap > 0 {
			result.Violated = true
			result.Gap.Amount = gap
		}
		response.Results = append(response.Results, result)
	}
	return response, nil
}

func (s *stubCostFetcher) FetchCosts(_ context.Context, _ string, skuIDs []string) (map[string]*commonv1.Money, error) {
	out := make(map[string]*commonv1.Money, len(skuIDs))
	for _, id := range skuIDs {
		if c, ok := s.costs[id]; ok {
			out[id] = c
		}
	}
	return out, nil
}

// newBatchClient creates an in-process gRPC server wired with the given cost stub.
// It reuses sharedDB and sharedRepo from the TestMain harness.
// Returns the client and a cleanup function the caller must invoke.
func newBatchClient(t *testing.T, costs map[string]*commonv1.Money) (marginpb.MarginServiceClient, func()) {
	return newBatchClientWithEvaluator(t, costs, &stubMarginEvaluator{})
}

func newBatchClientWithEvaluator(
	t *testing.T,
	costs map[string]*commonv1.Money,
	evaluator *stubMarginEvaluator,
) (marginpb.MarginServiceClient, func()) {
	t.Helper()
	svc := handler.NewRulesServer(
		sharedDB,
		sharedRepo,
		slog.Default(),
		&stubCostFetcher{costs: costs},
		evaluator,
	)

	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal("listen:", err)
	}
	s := grpc.NewServer()
	marginpb.RegisterMarginServiceServer(s, svc)
	go func() { _ = s.Serve(lis) }()

	conn, err := grpc.NewClient(lis.Addr().String(), grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		s.Stop()
		t.Fatal("dial:", err)
	}
	return marginpb.NewMarginServiceClient(conn), func() {
		_ = conn.Close()
		s.Stop()
	}
}

func money64(amount int64, currency string) *commonv1.Money {
	return &commonv1.Money{Amount: amount, Currency: currency}
}

// TestValidateBatch_Clean — proposed price above absolute floor → no violations.
func TestValidateBatch_Clean(t *testing.T) {
	skuID := "11000000-0000-0000-0000-000000000001"
	c, cleanup := newBatchClient(t, map[string]*commonv1.Money{skuID: money64(80000, "NGN")})
	defer cleanup()

	ctx := ctxOrg(orgClean)
	if _, err := c.UpsertRule(ctx, &marginpb.UpsertRuleRequest{
		Rule: &marginpb.MarginRule{
			SkuId:      skuID,
			FloorType:  marginpb.FloorType_FLOOR_TYPE_ABSOLUTE_MINIMUM,
			FloorValue: 50000,
			Currency:   "NGN",
			CreatedBy:  createdBy,
		},
	}); err != nil {
		t.Fatalf("seed rule: %v", err)
	}

	resp, err := c.ValidateBatch(ctx, &marginpb.ValidateBatchRequest{
		Items: []*marginpb.ValidateItem{
			{SkuId: skuID, ProposedPrice: money64(60000, "NGN")},
		},
	})
	if err != nil {
		t.Fatalf("ValidateBatch: %v", err)
	}
	if len(resp.Violations) != 0 {
		t.Errorf("expected 0 violations, got %d: %v", len(resp.Violations), resp.Violations)
	}
}

// TestValidateBatch_BlockedBelowFloor — proposed price below pct_margin floor → BLOCK.
func TestValidateBatch_BlockedBelowFloor(t *testing.T) {
	skuID := "22000000-0000-0000-0000-000000000002"
	// cost=100000, 20% margin → floor = ceil(100000*10000/8000) = 125000
	c, cleanup := newBatchClient(t, map[string]*commonv1.Money{skuID: money64(100000, "NGN")})
	defer cleanup()

	ctx := ctxOrg(orgBlocked)
	if _, err := c.UpsertRule(ctx, &marginpb.UpsertRuleRequest{
		Rule: &marginpb.MarginRule{
			SkuId:      skuID,
			FloorType:  marginpb.FloorType_FLOOR_TYPE_PCT_MARGIN,
			FloorValue: 2000, // 20% in basis points
			Currency:   "NGN",
			CreatedBy:  createdBy,
		},
	}); err != nil {
		t.Fatalf("seed rule: %v", err)
	}

	resp, err := c.ValidateBatch(ctx, &marginpb.ValidateBatchRequest{
		Items: []*marginpb.ValidateItem{
			{SkuId: skuID, ProposedPrice: money64(110000, "NGN")}, // below 125000 floor
		},
	})
	if err != nil {
		t.Fatalf("ValidateBatch: %v", err)
	}
	if len(resp.Violations) != 1 {
		t.Fatalf("expected 1 violation, got %d", len(resp.Violations))
	}
	v := resp.Violations[0]
	if v.Severity != marginpb.ViolationSeverity_VIOLATION_SEVERITY_BLOCK {
		t.Errorf("severity = %v, want BLOCK", v.Severity)
	}
	if v.SkuId != skuID {
		t.Errorf("sku_id = %q, want %q", v.SkuId, skuID)
	}
	if v.Gap.Amount <= 0 {
		t.Errorf("expected positive gap, got %d", v.Gap.Amount)
	}
	if v.RuleVersion != 1 || v.IntelligenceEngineVersion != "test-engine-v1" || len(v.EvaluationHash) != 64 {
		t.Errorf("missing intelligence provenance: %v", v)
	}
}

func TestValidateBatch_FailsClosedWhenIntelligenceIsUnavailableOrMalformed(t *testing.T) {
	tests := []struct {
		name      string
		orgID     string
		evaluator *stubMarginEvaluator
	}{
		{
			name:      "unavailable",
			orgID:     orgUnavailable,
			evaluator: &stubMarginEvaluator{err: errors.New("connection refused")},
		},
		{
			name:  "malformed",
			orgID: orgMalformed,
			evaluator: &stubMarginEvaluator{response: &intelligencepb.EvaluateMarginBatchResponse{
				EngineVersion: "broken-v1",
			}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			skuID := "77000000-0000-0000-0000-0000000000" + map[string]string{
				"unavailable": "90", "malformed": "91",
			}[tt.name]
			client, cleanup := newBatchClientWithEvaluator(t, nil, tt.evaluator)
			defer cleanup()
			ctx := ctxOrg(tt.orgID)
			if _, err := client.UpsertRule(ctx, &marginpb.UpsertRuleRequest{Rule: &marginpb.MarginRule{
				FloorType:  marginpb.FloorType_FLOOR_TYPE_ABSOLUTE_MINIMUM,
				FloorValue: 100, Currency: "NGN", CreatedBy: createdBy,
			}}); err != nil {
				t.Fatalf("seed rule: %v", err)
			}
			_, err := client.ValidateBatch(ctx, &marginpb.ValidateBatchRequest{Items: []*marginpb.ValidateItem{{
				SkuId: skuID, ProposedPrice: money64(90, "NGN"),
			}}})
			if status.Code(err) != codes.Internal {
				t.Fatalf("expected fail-closed Internal, got %v", err)
			}
		})
	}
}

// TestValidateBatch_CurrencyMismatch — rule currency ≠ proposed price currency → BLOCK.
func TestValidateBatch_CurrencyMismatch(t *testing.T) {
	skuID := "33000000-0000-0000-0000-000000000003"
	c, cleanup := newBatchClient(t, map[string]*commonv1.Money{skuID: money64(80000, "NGN")})
	defer cleanup()

	ctx := ctxOrg(orgCurrency)
	if _, err := c.UpsertRule(ctx, &marginpb.UpsertRuleRequest{
		Rule: &marginpb.MarginRule{
			SkuId:      skuID,
			FloorType:  marginpb.FloorType_FLOOR_TYPE_ABSOLUTE_MINIMUM,
			FloorValue: 50000,
			Currency:   "NGN",
			CreatedBy:  createdBy,
		},
	}); err != nil {
		t.Fatalf("seed rule: %v", err)
	}

	resp, err := c.ValidateBatch(ctx, &marginpb.ValidateBatchRequest{
		Items: []*marginpb.ValidateItem{
			{SkuId: skuID, ProposedPrice: money64(60000, "USD")}, // wrong currency
		},
	})
	if err != nil {
		t.Fatalf("ValidateBatch: %v", err)
	}
	if len(resp.Violations) != 1 {
		t.Fatalf("expected 1 violation, got %d", len(resp.Violations))
	}
	if resp.Violations[0].Severity != marginpb.ViolationSeverity_VIOLATION_SEVERITY_BLOCK {
		t.Errorf("severity = %v, want BLOCK", resp.Violations[0].Severity)
	}
}

// TestValidateBatch_NoMatchingRule — SKU with no rule → no violations.
func TestValidateBatch_NoMatchingRule(t *testing.T) {
	skuID := "44000000-0000-0000-0000-000000000004"
	// orgNoRule has no rules seeded — any proposal should come back clean.
	c, cleanup := newBatchClient(t, nil)
	defer cleanup()

	resp, err := c.ValidateBatch(ctxOrg(orgNoRule), &marginpb.ValidateBatchRequest{
		Items: []*marginpb.ValidateItem{
			{SkuId: skuID, ProposedPrice: money64(1000, "NGN")},
		},
	})
	if err != nil {
		t.Fatalf("ValidateBatch: %v", err)
	}
	if len(resp.Violations) != 0 {
		t.Errorf("expected 0 violations for org with no rules, got %d: %v", len(resp.Violations), resp.Violations)
	}
}

// TestValidateBatch_EmptyItems — must return InvalidArgument.
func TestValidateBatch_EmptyItems(t *testing.T) {
	c, cleanup := newBatchClient(t, nil)
	defer cleanup()

	_, err := c.ValidateBatch(ctxOrg(orgA), &marginpb.ValidateBatchRequest{})
	if status.Code(err) != codes.InvalidArgument {
		t.Errorf("expected InvalidArgument, got %v", err)
	}
}

// TestValidateBatch_RulePrecedence — sku-scoped rule (floor=70000) beats org-wide rule
// (floor=90000); proposed=85000 should be clean because sku rule wins.
func TestValidateBatch_RulePrecedence(t *testing.T) {
	skuID := "55000000-0000-0000-0000-000000000005"
	c, cleanup := newBatchClient(t, map[string]*commonv1.Money{skuID: money64(80000, "NGN")})
	defer cleanup()

	ctx := ctxOrg(orgPrecA)
	// org-wide rule: floor=90000 — proposed 85000 would be a BLOCK under this rule
	if _, err := c.UpsertRule(ctx, &marginpb.UpsertRuleRequest{
		Rule: &marginpb.MarginRule{
			FloorType:  marginpb.FloorType_FLOOR_TYPE_ABSOLUTE_MINIMUM,
			FloorValue: 90000,
			Currency:   "NGN",
			CreatedBy:  createdBy,
		},
	}); err != nil {
		t.Fatalf("seed org-wide rule: %v", err)
	}
	// sku-scoped rule: floor=70000 — proposed 85000 is clean under this rule
	if _, err := c.UpsertRule(ctx, &marginpb.UpsertRuleRequest{
		Rule: &marginpb.MarginRule{
			SkuId:      skuID,
			FloorType:  marginpb.FloorType_FLOOR_TYPE_ABSOLUTE_MINIMUM,
			FloorValue: 70000,
			Currency:   "NGN",
			CreatedBy:  createdBy,
		},
	}); err != nil {
		t.Fatalf("seed sku rule: %v", err)
	}

	resp, err := c.ValidateBatch(ctx, &marginpb.ValidateBatchRequest{
		Items: []*marginpb.ValidateItem{
			{SkuId: skuID, ProposedPrice: money64(85000, "NGN")},
		},
	})
	if err != nil {
		t.Fatalf("ValidateBatch: %v", err)
	}
	for _, v := range resp.Violations {
		if v.SkuId == skuID {
			t.Errorf("sku-scoped rule (floor=70000) should win over org-wide (floor=90000); proposed=85000 is clean; got violation: %v", v)
		}
	}
}

// TestValidateBatch_RLSIsolation — rules from orgRLSA not visible to orgRLSB.
func TestValidateBatch_RLSIsolation(t *testing.T) {
	skuID := "66000000-0000-0000-0000-000000000006"
	c, cleanup := newBatchClient(t, map[string]*commonv1.Money{skuID: money64(80000, "NGN")})
	defer cleanup()

	// Seed a blocking rule for orgRLSA.
	if _, err := c.UpsertRule(ctxOrg(orgRLSA), &marginpb.UpsertRuleRequest{
		Rule: &marginpb.MarginRule{
			SkuId:      skuID,
			FloorType:  marginpb.FloorType_FLOOR_TYPE_ABSOLUTE_MINIMUM,
			FloorValue: 200000,
			Currency:   "NGN",
			CreatedBy:  createdBy,
		},
	}); err != nil {
		t.Fatalf("seed orgRLSA rule: %v", err)
	}

	// Validate as orgRLSB — must not see orgRLSA's rule.
	resp, err := c.ValidateBatch(ctxOrg(orgRLSB), &marginpb.ValidateBatchRequest{
		Items: []*marginpb.ValidateItem{
			{SkuId: skuID, ProposedPrice: money64(10000, "NGN")},
		},
	})
	if err != nil {
		t.Fatalf("ValidateBatch orgRLSB: %v", err)
	}
	if len(resp.Violations) != 0 {
		t.Errorf("orgRLSB should not see orgRLSA rule, but got %d violations", len(resp.Violations))
	}
}
