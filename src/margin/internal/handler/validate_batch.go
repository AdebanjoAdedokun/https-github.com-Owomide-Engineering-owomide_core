package handler

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	commonv1 "github.com/owomide/proto/common/v1"
	intelligencepb "github.com/owomide/proto/services/intelligence/v1"
	marginpb "github.com/owomide/proto/services/margin/v1"

	"github.com/owomide/margin/internal/client"
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

	if len(rules) == 0 {
		return &marginpb.ValidateBatchResponse{}, nil
	}

	evaluation, err := s.evaluator.EvaluateMargin(ctx, orgID, rules, req.Items, costs)
	if err != nil {
		s.logger.ErrorContext(ctx, "validate batch: intelligence unavailable", "error", err, "org_id", orgID)
		return nil, status.Error(codes.Internal, "margin intelligence unavailable")
	}
	violations, err := evaluationViolations(req.Items, evaluation)
	if err != nil {
		s.logger.ErrorContext(ctx, "validate batch: invalid intelligence response", "error", err, "org_id", orgID)
		return nil, status.Error(codes.Internal, "margin intelligence returned an invalid response")
	}
	return &marginpb.ValidateBatchResponse{Violations: violations}, nil
}

func evaluationViolations(
	items []*marginpb.ValidateItem,
	response *intelligencepb.EvaluateMarginBatchResponse,
) ([]*marginpb.Violation, error) {
	if response == nil || strings.TrimSpace(response.EngineVersion) == "" {
		return nil, fmt.Errorf("missing intelligence engine version")
	}
	if len(response.Results) != len(items) {
		return nil, fmt.Errorf("received %d results for %d items", len(response.Results), len(items))
	}
	indexed := make([]*intelligencepb.MarginEvaluationResult, len(items))
	for _, result := range response.Results {
		if result == nil {
			return nil, fmt.Errorf("received a nil result")
		}
		index, err := strconv.Atoi(result.ItemId)
		if err != nil || index < 0 || index >= len(items) {
			return nil, fmt.Errorf("invalid result item_id %q", result.ItemId)
		}
		if indexed[index] != nil {
			return nil, fmt.Errorf("duplicate result item_id %q", result.ItemId)
		}
		indexed[index] = result
	}

	violations := make([]*marginpb.Violation, 0)
	for index, item := range items {
		result := indexed[index]
		if result == nil {
			return nil, fmt.Errorf("missing result for item %d", index)
		}
		if err := client.ValidateMarginEvaluation(item, result); err != nil {
			return nil, fmt.Errorf("result %d: %w", index, err)
		}

		switch result.Status {
		case intelligencepb.MarginEvaluationStatus_MARGIN_EVALUATION_STATUS_NO_MATCH:
		case intelligencepb.MarginEvaluationStatus_MARGIN_EVALUATION_STATUS_MATCHED:
			if result.Violated {
				violations = append(violations, &marginpb.Violation{
					SkuId:                     item.SkuId,
					RuleId:                    result.GetAppliedRuleId(),
					RuleVersion:               result.GetAppliedRuleVersion(),
					Severity:                  marginpb.ViolationSeverity_VIOLATION_SEVERITY_BLOCK,
					Message:                   fmt.Sprintf("proposed price %d is below floor %d", item.ProposedPrice.Amount, result.Floor.Amount),
					Floor:                     result.Floor,
					Proposed:                  item.ProposedPrice,
					Gap:                       result.Gap,
					IntelligenceEngineVersion: response.EngineVersion,
					EvaluationHash:            result.EvaluationHash,
				})
			}
		case intelligencepb.MarginEvaluationStatus_MARGIN_EVALUATION_STATUS_ERROR:
			zero := &commonv1.Money{Amount: 0, Currency: item.ProposedPrice.Currency}
			violations = append(violations, &marginpb.Violation{
				SkuId:                     item.SkuId,
				RuleId:                    result.GetAppliedRuleId(),
				RuleVersion:               result.GetAppliedRuleVersion(),
				Severity:                  marginpb.ViolationSeverity_VIOLATION_SEVERITY_BLOCK,
				Message:                   fmt.Sprintf("margin evaluation failed (%s): %s", result.GetErrorCode(), result.GetErrorMessage()),
				Floor:                     zero,
				Proposed:                  item.ProposedPrice,
				Gap:                       zero,
				IntelligenceEngineVersion: response.EngineVersion,
				EvaluationHash:            result.EvaluationHash,
			})
		default:
			return nil, fmt.Errorf("result %d has an invalid status", index)
		}
	}
	return violations, nil
}

func mapKeys(m map[string]struct{}) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
