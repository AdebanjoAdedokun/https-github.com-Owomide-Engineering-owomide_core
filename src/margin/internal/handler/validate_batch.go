package handler

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	commonv1 "github.com/owomide/proto/common/v1"
	marginpb "github.com/owomide/proto/services/margin/v1"

	"github.com/owomide/margin/internal/domain"
	"github.com/owomide/margin/internal/repo"
)

func (s *RulesServer) ValidateBatch(ctx context.Context, req *marginpb.ValidateBatchRequest) (*marginpb.ValidateBatchResponse, error) {
	if len(req.Items) == 0 {
		return nil, status.Error(codes.InvalidArgument, "items must not be empty — ValidateBatch requires at least one item")
	}

	orgID, err := orgIDFromCtx(ctx)
	if err != nil {
		return nil, err
	}

	// Validate UUID format up-front so Postgres cast errors become InvalidArgument,
	// not a misleading Internal.
	for _, item := range req.Items {
		if item.SkuId == "" {
			return nil, status.Error(codes.InvalidArgument, "each item must have a sku_id")
		}
		if _, err := uuid.Parse(item.SkuId); err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid sku_id %q: not a UUID", item.SkuId)
		}
		if item.ChannelId != "" {
			if _, err := uuid.Parse(item.ChannelId); err != nil {
				return nil, status.Errorf(codes.InvalidArgument, "invalid channel_id %q: not a UUID", item.ChannelId)
			}
		}
		if item.ProposedPrice == nil {
			return nil, status.Errorf(codes.InvalidArgument, "item with sku_id %q is missing proposed_price", item.SkuId)
		}
	}

	skuSet := make(map[string]struct{}, len(req.Items))
	chanSet := make(map[string]struct{}, len(req.Items))
	for _, item := range req.Items {
		skuSet[item.SkuId] = struct{}{}
		if item.ChannelId != "" {
			chanSet[item.ChannelId] = struct{}{}
		}
	}
	skuIDs := mapKeys(skuSet)
	chanIDs := mapKeys(chanSet)

	var rules []*repo.MarginRuleRow
	if err := s.db.WithOrgTx(ctx, orgID, func(tx pgx.Tx) error {
		var txErr error
		rules, txErr = s.repo.GetRulesForBatch(ctx, tx, skuIDs, chanIDs)
		return txErr
	}); err != nil {
		s.logger.ErrorContext(ctx, "validate batch: fetch rules", "error", err, "org_id", orgID)
		return nil, status.Error(codes.Internal, "internal error")
	}

	costs, err := s.costFetcher.FetchCosts(ctx, orgID, skuIDs)
	if err != nil {
		s.logger.ErrorContext(ctx, "validate batch: fetch costs", "error", err, "org_id", orgID)
		return nil, status.Error(codes.Internal, "internal error")
	}

	var violations []*marginpb.Violation
	for _, item := range req.Items {
		if v := validateItem(item, rules, costs); v != nil {
			violations = append(violations, v)
		}
	}

	return &marginpb.ValidateBatchResponse{Violations: violations}, nil
}

func validateItem(item *marginpb.ValidateItem, rules []*repo.MarginRuleRow, costs map[string]*commonv1.Money) *marginpb.Violation {
	matched := domain.FindBestRule(item.SkuId, item.ChannelId, rules)
	if matched == nil {
		return nil
	}

	// proposed is guaranteed non-nil by the validation in ValidateBatch.
	proposed := item.ProposedPrice
	zeroCurrency := func() *commonv1.Money { return &commonv1.Money{Amount: 0, Currency: matched.Currency} }

	if proposed.Currency != matched.Currency {
		return &marginpb.Violation{
			SkuId:    item.SkuId,
			RuleId:   matched.ID,
			Severity: marginpb.ViolationSeverity_VIOLATION_SEVERITY_BLOCK,
			Message:  fmt.Sprintf("currency mismatch: rule expects %s, proposed is %s", matched.Currency, proposed.Currency),
			Floor:    zeroCurrency(),
			Proposed: proposed,
			Gap:      zeroCurrency(),
		}
	}

	floor, err := domain.ComputeFloor(matched, costs[item.SkuId])
	if err != nil {
		msg := "cannot compute floor"
		if errors.Is(err, domain.ErrNoCost) {
			msg = "no cost record found for SKU — cannot validate margin"
		}
		return &marginpb.Violation{
			SkuId:    item.SkuId,
			RuleId:   matched.ID,
			Severity: marginpb.ViolationSeverity_VIOLATION_SEVERITY_BLOCK,
			Message:  msg,
			Floor:    zeroCurrency(),
			Proposed: proposed,
			Gap:      zeroCurrency(),
		}
	}

	if proposed.Amount < floor {
		return &marginpb.Violation{
			SkuId:    item.SkuId,
			RuleId:   matched.ID,
			Severity: marginpb.ViolationSeverity_VIOLATION_SEVERITY_BLOCK,
			Message:  fmt.Sprintf("proposed price %d is below floor %d (%s)", proposed.Amount, floor, matched.FloorType),
			Floor:    &commonv1.Money{Amount: floor, Currency: matched.Currency},
			Proposed: proposed,
			Gap:      &commonv1.Money{Amount: floor - proposed.Amount, Currency: matched.Currency},
		}
	}

	return nil
}

func mapKeys(m map[string]struct{}) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
