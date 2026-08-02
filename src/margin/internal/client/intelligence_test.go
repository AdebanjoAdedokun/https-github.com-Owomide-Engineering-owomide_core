package client

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net"
	"strings"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"

	commonv1 "github.com/owomide/proto/common/v1"
	intelligencepb "github.com/owomide/proto/services/intelligence/v1"
	marginpb "github.com/owomide/proto/services/margin/v1"

	"github.com/owomide/margin/internal/repo"
)

const testIntelligenceSecret = "margin-intelligence-test-secret-at-least-32-chars"

type captureIntelligenceServer struct {
	intelligencepb.UnimplementedIntelligenceServiceServer
	metadata metadata.MD
	request  *intelligencepb.EvaluateMarginBatchRequest
}

func (s *captureIntelligenceServer) EvaluateMarginBatch(
	ctx context.Context,
	request *intelligencepb.EvaluateMarginBatchRequest,
) (*intelligencepb.EvaluateMarginBatchResponse, error) {
	s.metadata, _ = metadata.FromIncomingContext(ctx)
	s.request = request
	return &intelligencepb.EvaluateMarginBatchResponse{EngineVersion: "test-v1"}, nil
}

func TestIntelligenceClientSignsAndMapsBatch(t *testing.T) {
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	server := grpc.NewServer()
	capture := &captureIntelligenceServer{}
	intelligencepb.RegisterIntelligenceServiceServer(server, capture)
	go func() { _ = server.Serve(lis) }()
	defer server.Stop()

	conn, err := grpc.NewClient(lis.Addr().String(), grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close() }()
	evaluator, err := NewIntelligenceClient(conn, testIntelligenceSecret, "owomide-internal", time.Second)
	if err != nil {
		t.Fatal(err)
	}

	skuID := "11111111-1111-1111-1111-111111111111"
	response, err := evaluator.EvaluateMargin(
		context.Background(),
		"00000000-0000-0000-0000-000000000001",
		[]*repo.MarginRuleRow{{
			ID: "rule-1", SkuID: &skuID, FloorType: "pct_margin", FloorValue: 2_000,
			Currency: "NGN", Version: 3,
		}},
		[]*marginpb.ValidateItem{{
			SkuId: skuID, ChannelId: "retail",
			ProposedPrice: &commonv1.Money{Amount: 90_000, Currency: "NGN"},
		}},
		map[string]*commonv1.Money{skuID: {Amount: 80_000, Currency: "NGN"}},
	)
	if err != nil {
		t.Fatal(err)
	}
	if response.EngineVersion != "test-v1" {
		t.Fatalf("engine version = %q", response.EngineVersion)
	}

	if got := capture.metadata.Get("x-org-id"); len(got) != 1 || got[0] != "00000000-0000-0000-0000-000000000001" {
		t.Fatalf("x-org-id = %v", got)
	}
	if got := capture.metadata.Get("x-user-id"); len(got) != 1 || got[0] != intelligenceSubject {
		t.Fatalf("x-user-id = %v", got)
	}
	authorization := capture.metadata.Get("authorization")
	if len(authorization) != 1 || !strings.HasPrefix(authorization[0], "Bearer ") {
		t.Fatalf("authorization metadata = %v", authorization)
	}
	assertJWT(t, strings.TrimPrefix(authorization[0], "Bearer "))

	if capture.request == nil || len(capture.request.Rules) != 1 || len(capture.request.Items) != 1 {
		t.Fatalf("mapped request = %#v", capture.request)
	}
	mappedRule := capture.request.Rules[0]
	if mappedRule.Priority != 300 || mappedRule.RuleVersion != 3 ||
		mappedRule.FloorType != intelligencepb.MarginFloorType_MARGIN_FLOOR_TYPE_PCT_MARGIN {
		t.Fatalf("mapped rule = %#v", mappedRule)
	}
	if mappedRule.GetWhen().GetCondition().GetFact() != "sku_id" ||
		mappedRule.GetWhen().GetCondition().GetValues()[0].GetStringValue() != skuID {
		t.Fatalf("mapped scope = %#v", mappedRule.GetWhen())
	}
	mappedItem := capture.request.Items[0]
	if mappedItem.ItemId != "0" || mappedItem.GetCost().GetAmount() != 80_000 {
		t.Fatalf("mapped item = %#v", mappedItem)
	}
}

func TestIntelligenceClientRejectsUnsafeConfiguration(t *testing.T) {
	if _, err := NewIntelligenceClient(nil, testIntelligenceSecret, "issuer", time.Second); err == nil {
		t.Fatal("expected nil connection to be rejected")
	}
}

func TestRuleDefinitionPreservesScopePrecedence(t *testing.T) {
	channelID := "22222222-2222-2222-2222-222222222222"
	categoryID := "33333333-3333-3333-3333-333333333333"
	channel, err := ruleDefinition(&repo.MarginRuleRow{
		ID: "channel", ChannelID: &channelID, CategoryID: &categoryID,
		FloorType: "absolute_minimum", FloorValue: 1, Currency: "NGN", Version: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	category, err := ruleDefinition(&repo.MarginRuleRow{
		ID: "category", CategoryID: &categoryID,
		FloorType: "absolute_minimum", FloorValue: 1, Currency: "NGN", Version: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	if channel.Priority != 200 || channel.GetWhen().GetCondition().GetFact() != "channel_id" {
		t.Fatalf("channel scope = %#v", channel)
	}
	if category.Priority != 100 || category.GetWhen().GetCondition().GetFact() != "category_id" {
		t.Fatalf("category scope = %#v", category)
	}
}

func TestValidateMarginEvaluationRejectsMalformedOutcomes(t *testing.T) {
	item := &marginpb.ValidateItem{
		SkuId: "sku-1", ProposedPrice: &commonv1.Money{Amount: 90, Currency: "NGN"},
	}
	hash := strings.Repeat("a", 64)
	ruleID := "rule-1"
	ruleVersion := int32(1)
	tests := []struct {
		name   string
		result *intelligencepb.MarginEvaluationResult
	}{
		{
			name: "unspecified status",
			result: &intelligencepb.MarginEvaluationResult{
				ProposedPrice: item.ProposedPrice, EvaluationHash: hash,
			},
		},
		{
			name: "no match with hidden rule",
			result: &intelligencepb.MarginEvaluationResult{
				Status:        intelligencepb.MarginEvaluationStatus_MARGIN_EVALUATION_STATUS_NO_MATCH,
				ProposedPrice: item.ProposedPrice, EvaluationHash: hash,
				AppliedRuleId: &ruleID, AppliedRuleVersion: &ruleVersion,
			},
		},
		{
			name: "clean match with suppressed breach",
			result: &intelligencepb.MarginEvaluationResult{
				Status:        intelligencepb.MarginEvaluationStatus_MARGIN_EVALUATION_STATUS_MATCHED,
				ProposedPrice: item.ProposedPrice, EvaluationHash: hash,
				AppliedRuleId: &ruleID, AppliedRuleVersion: &ruleVersion,
				MatchedRuleIds: []string{ruleID},
				Floor:          &commonv1.Money{Amount: 100, Currency: "NGN"},
				Gap:            &commonv1.Money{Amount: 0, Currency: "NGN"},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := ValidateMarginEvaluation(item, tt.result); err == nil {
				t.Fatal("expected malformed result to be rejected")
			}
		})
	}
}

func TestValidateMarginEvaluationAcceptsConsistentOutcomes(t *testing.T) {
	item := &marginpb.ValidateItem{
		SkuId: "sku-1", ProposedPrice: &commonv1.Money{Amount: 90, Currency: "NGN"},
	}
	hash := strings.Repeat("a", 64)
	ruleID := "rule-1"
	ruleVersion := int32(1)
	matched := &intelligencepb.MarginEvaluationResult{
		Status:        intelligencepb.MarginEvaluationStatus_MARGIN_EVALUATION_STATUS_MATCHED,
		ProposedPrice: item.ProposedPrice, EvaluationHash: hash,
		AppliedRuleId: &ruleID, AppliedRuleVersion: &ruleVersion,
		MatchedRuleIds: []string{ruleID},
		Floor:          &commonv1.Money{Amount: 100, Currency: "NGN"},
		Gap:            &commonv1.Money{Amount: 10, Currency: "NGN"},
		Violated:       true,
	}
	if err := ValidateMarginEvaluation(item, matched); err != nil {
		t.Fatalf("matched result rejected: %v", err)
	}
	noMatch := &intelligencepb.MarginEvaluationResult{
		Status:        intelligencepb.MarginEvaluationStatus_MARGIN_EVALUATION_STATUS_NO_MATCH,
		ProposedPrice: item.ProposedPrice, EvaluationHash: hash,
	}
	if err := ValidateMarginEvaluation(item, noMatch); err != nil {
		t.Fatalf("no-match result rejected: %v", err)
	}
}

func assertJWT(t *testing.T, token string) {
	t.Helper()
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("invalid JWT segments: %q", token)
	}
	mac := hmac.New(sha256.New, []byte(testIntelligenceSecret))
	_, _ = mac.Write([]byte(parts[0] + "." + parts[1]))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(parts[2])) {
		t.Fatal("JWT signature does not match")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatal(err)
	}
	var claims map[string]any
	if err := json.Unmarshal(payload, &claims); err != nil {
		t.Fatal(err)
	}
	if claims["sub"] != intelligenceSubject || claims["aud"] != intelligenceAudience ||
		claims["iss"] != "owomide-internal" {
		t.Fatalf("JWT claims = %#v", claims)
	}
}
