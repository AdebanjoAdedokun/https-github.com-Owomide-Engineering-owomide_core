package monitor

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"

	buspkg "github.com/owomide/bus/pkg/bus"
	commonv1 "github.com/owomide/proto/common/v1"
	marginev1 "github.com/owomide/proto/events/margin"
	intelligencepb "github.com/owomide/proto/services/intelligence/v1"
	marginpb "github.com/owomide/proto/services/margin/v1"

	"github.com/owomide/margin/internal/client"
	"github.com/owomide/margin/internal/db"
	"github.com/owomide/margin/internal/repo"
)

const topic = "margin.breach_detected"

// BreachMonitor periodically scans canonical prices for rule-covered SKUs and
// publishes margin.breach_detected events for any price found below its floor.
type BreachMonitor struct {
	database     *db.DB
	repo         *repo.Repo
	costFetcher  client.CostFetcher
	priceFetcher client.PriceFetcher
	evaluator    client.MarginEvaluator
	publisher    buspkg.Publisher
	interval     time.Duration
	batchSize    int
	logger       *slog.Logger

	// in-memory cursor — only touched from the Start goroutine (or single-threaded tests)
	orgCache   []string
	nextOrgIdx int
}

func New(
	database *db.DB,
	r *repo.Repo,
	cost client.CostFetcher,
	price client.PriceFetcher,
	evaluator client.MarginEvaluator,
	pub buspkg.Publisher,
	interval time.Duration,
	batchSize int,
	logger *slog.Logger,
) *BreachMonitor {
	if batchSize <= 0 {
		batchSize = 100
	}
	if evaluator == nil {
		panic("monitor.New: evaluator must not be nil")
	}
	return &BreachMonitor{
		database:     database,
		repo:         r,
		costFetcher:  cost,
		priceFetcher: price,
		evaluator:    evaluator,
		publisher:    pub,
		interval:     interval,
		batchSize:    batchSize,
		logger:       logger,
	}
}

// Start launches the scan loop in a background goroutine. Returns immediately.
// The goroutine exits when ctx is cancelled.
func (m *BreachMonitor) Start(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(m.interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := m.ScanOnce(ctx); err != nil {
					m.logger.Error("breach monitor scan failed", "error", err)
				}
			}
		}
	}()
}

// ScanOnce processes the next batch of orgs with active scoped rules.
// Re-fetches the org list at the start of each new cycle (nextOrgIdx == 0).
// Exported so integration tests can call it directly.
func (m *BreachMonitor) ScanOnce(ctx context.Context) error {
	if m.nextOrgIdx == 0 {
		orgs, err := m.repo.GetMonitoredOrgs(ctx, m.database.Pool)
		if err != nil {
			return fmt.Errorf("GetMonitoredOrgs: %w", err)
		}
		m.orgCache = orgs
	}

	if len(m.orgCache) == 0 {
		return nil
	}

	end := m.nextOrgIdx + m.batchSize
	if end > len(m.orgCache) {
		end = len(m.orgCache)
	}
	batch := m.orgCache[m.nextOrgIdx:end]

	for _, orgID := range batch {
		if err := m.scanOrg(ctx, orgID); err != nil {
			m.logger.Error("scan org failed", "org_id", orgID, "error", err)
		}
	}

	m.nextOrgIdx = end
	if m.nextOrgIdx >= len(m.orgCache) {
		total := len(m.orgCache)
		m.nextOrgIdx = 0
		m.orgCache = nil
		m.logger.Info("breach monitor completed full org cycle", "orgs_scanned", total)
	}
	return nil
}

func (m *BreachMonitor) scanOrg(ctx context.Context, orgID string) error {
	targets, err := m.repo.GetRuleTargets(ctx, m.database.Pool, orgID)
	if err != nil {
		return fmt.Errorf("GetRuleTargets: %w", err)
	}
	if len(targets) == 0 {
		m.logger.Warn("org has no scoped rule targets; org-wide rules are not monitored", "org_id", orgID)
		return nil
	}

	skuSet := make(map[string]struct{}, len(targets))
	channelSet := make(map[string]struct{}, len(targets))
	for _, t := range targets {
		skuSet[t.SkuID] = struct{}{}
		channelSet[t.ChannelID] = struct{}{}
	}
	skuIDs := keys(skuSet)
	channelIDs := keys(channelSet)

	prices, err := m.priceFetcher.FetchPrices(ctx, orgID, skuIDs, "")
	if err != nil {
		return fmt.Errorf("FetchPrices: %w", err)
	}
	if len(prices) == 0 {
		return nil
	}

	costs, err := m.costFetcher.FetchCosts(ctx, orgID, skuIDs)
	if err != nil {
		return fmt.Errorf("FetchCosts: %w", err)
	}

	var rules []*repo.MarginRuleRow
	if err := m.database.WithOrgTx(ctx, orgID, func(tx pgx.Tx) error {
		var txErr error
		rules, txErr = m.repo.GetRulesForBatch(ctx, tx, skuIDs, channelIDs)
		return txErr
	}); err != nil {
		return fmt.Errorf("GetRulesForBatch: %w", err)
	}

	items := make([]*marginpb.ValidateItem, 0, len(prices))
	for _, pr := range prices {
		if pr.Price == nil {
			continue
		}
		items = append(items, &marginpb.ValidateItem{
			SkuId: pr.SkuId, ChannelId: pr.ChannelId, ProposedPrice: pr.Price,
		})
	}
	if len(items) == 0 || len(rules) == 0 {
		return nil
	}
	evaluation, err := m.evaluator.EvaluateMargin(ctx, orgID, rules, items, costs)
	if err != nil {
		return fmt.Errorf("EvaluateMargin: %w", err)
	}
	if evaluation == nil || evaluation.EngineVersion == "" || len(evaluation.Results) != len(items) {
		return fmt.Errorf("intelligence returned an invalid result count or engine version")
	}
	now := time.Now().UTC()
	seen := make(map[int]struct{}, len(items))
	for _, result := range evaluation.Results {
		index, err := strconv.Atoi(result.ItemId)
		if err != nil || index < 0 || index >= len(items) {
			return fmt.Errorf("intelligence returned invalid item_id %q", result.ItemId)
		}
		if _, duplicate := seen[index]; duplicate {
			return fmt.Errorf("intelligence repeated item_id %q", result.ItemId)
		}
		seen[index] = struct{}{}
		item := items[index]
		if err := client.ValidateMarginEvaluation(item, result); err != nil {
			return fmt.Errorf("intelligence returned an invalid result for item %d: %w", index, err)
		}
		if result.Status == intelligencepb.MarginEvaluationStatus_MARGIN_EVALUATION_STATUS_ERROR {
			m.logger.Warn(
				"skip breach check",
				"sku_id", item.SkuId,
				"channel_id", item.ChannelId,
				"reason", result.GetErrorCode(),
			)
			continue
		}
		if result.Status == intelligencepb.MarginEvaluationStatus_MARGIN_EVALUATION_STATUS_NO_MATCH || !result.Violated {
			continue
		}
		if err := m.publishBreach(
			ctx,
			orgID,
			item.SkuId,
			item.ChannelId,
			result.GetAppliedRuleId(),
			result.GetAppliedRuleVersion(),
			evaluation.EngineVersion,
			result.EvaluationHash,
			item.ProposedPrice,
			result.Floor.Amount,
			now,
		); err != nil {
			m.logger.Error("publish breach failed", "org_id", orgID, "sku_id", item.SkuId, "error", err)
		}
	}
	return nil
}

func (m *BreachMonitor) publishBreach(
	ctx context.Context,
	orgID, skuID, channelID, ruleID string,
	ruleVersion int32,
	engineVersion, evaluationHash string,
	currentPrice *commonv1.Money,
	floorAmount int64,
	now time.Time,
) error {
	gap := floorAmount - currentPrice.Amount
	payload, err := proto.Marshal(&marginev1.MarginBreachDetected{
		OrgId:     orgID,
		SkuId:     skuID,
		ChannelId: channelID,
		RuleId:    ruleID,
		Message:   fmt.Sprintf("price %d is %d below floor %d (%s)", currentPrice.Amount, gap, floorAmount, currentPrice.Currency),
		CurrentPrice: &commonv1.Money{
			Amount:   currentPrice.Amount,
			Currency: currentPrice.Currency,
		},
		FloorPrice: &commonv1.Money{
			Amount:   floorAmount,
			Currency: currentPrice.Currency,
		},
		Gap: &commonv1.Money{
			Amount:   gap,
			Currency: currentPrice.Currency,
		},
		DetectedAt:                timestamppb.New(now),
		RuleVersion:               ruleVersion,
		IntelligenceEngineVersion: engineVersion,
		EvaluationHash:            evaluationHash,
	})
	if err != nil {
		return fmt.Errorf("marshal breach payload: %w", err)
	}

	return m.publisher.Publish(ctx, topic, &buspkg.Event{
		ID:           uuid.NewString(),
		Type:         topic,
		OccurredAt:   now.Format(time.RFC3339),
		PartitionKey: orgID,
		Payload:      payload,
	})
}

func keys(m map[string]struct{}) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
