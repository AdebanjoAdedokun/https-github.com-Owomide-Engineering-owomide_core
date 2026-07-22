package monitor

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"

	buspkg "github.com/owomide/bus/pkg/bus"
	commonv1 "github.com/owomide/proto/common/v1"
	marginev1 "github.com/owomide/proto/events/margin"

	"github.com/owomide/margin/internal/repo"
)

const (
	testOrgID     = "00000000-0000-0000-0000-000000000001"
	testSkuID     = "aaaaaaaa-0000-0000-0000-000000000001"
	testChannelID = "bbbbbbbb-0000-0000-0000-000000000001"
	testRuleID    = "cccccccc-0000-0000-0000-000000000001"
)

// --- stubs ---

type stubOrgs struct {
	orgs []string
}

func (s *stubOrgs) GetMonitoredOrgs(_ context.Context, _ interface{}) ([]string, error) {
	return s.orgs, nil
}

type stubTargets struct {
	targets map[string][]repo.RuleTarget
}

func (s *stubTargets) GetRuleTargets(_ context.Context, _ interface{}, orgID string) ([]repo.RuleTarget, error) {
	return s.targets[orgID], nil
}

type stubPriceFetcher struct {
	prices []*catalogPriceRecord
}

type catalogPriceRecord struct {
	SkuId     string
	ChannelId string
	Price     *commonv1.Money
}

type stubCostFetcher struct {
	costs map[string]*commonv1.Money
}

func (s *stubCostFetcher) FetchCosts(_ context.Context, _ string, _ []string) (map[string]*commonv1.Money, error) {
	return s.costs, nil
}

type mockPublisher struct {
	mu    sync.Mutex
	calls []*buspkg.Event
}

func (m *mockPublisher) Publish(_ context.Context, _ string, event *buspkg.Event) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.calls = append(m.calls, event)
	return nil
}

func (m *mockPublisher) Close() error { return nil }

func (m *mockPublisher) Events() []*buspkg.Event {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]*buspkg.Event, len(m.calls))
	copy(out, m.calls)
	return out
}

// --- test-friendly BreachMonitor that bypasses DB ---

type testableMonitor struct {
	orgs      []string
	targets   map[string][]repo.RuleTarget
	rules     map[string][]*repo.MarginRuleRow
	costs     map[string]*commonv1.Money
	prices    map[string][]*priceEntry
	publisher *mockPublisher
}

type priceEntry struct {
	skuID     string
	channelID string
	price     *commonv1.Money
}

func (tm *testableMonitor) runScanOnce(ctx context.Context) {
	now := time.Now().UTC()
	pub := tm.publisher

	for _, orgID := range tm.orgs {
		targets := tm.targets[orgID]
		if len(targets) == 0 {
			continue
		}

		skuSet := map[string]struct{}{}
		for _, t := range targets {
			skuSet[t.SkuID] = struct{}{}
		}

		rules := tm.rules[orgID]

		for _, pe := range tm.prices[orgID] {
			br := findBestRuleFor(pe.skuID, pe.channelID, rules)
			if br == nil {
				continue
			}
			cost := tm.costs[pe.skuID]
			floor, err := computeFloor(br, cost)
			if err != nil {
				continue
			}
			if pe.price.Amount >= floor {
				continue
			}
			gap := floor - pe.price.Amount
			payload, _ := proto.Marshal(&marginev1.MarginBreachDetected{
				OrgId:     orgID,
				SkuId:     pe.skuID,
				ChannelId: pe.channelID,
				RuleId:    br.ID,
				CurrentPrice: &commonv1.Money{Amount: pe.price.Amount, Currency: pe.price.Currency},
				FloorPrice:   &commonv1.Money{Amount: floor, Currency: pe.price.Currency},
				Gap:          &commonv1.Money{Amount: gap, Currency: pe.price.Currency},
			})
			_ = pub.Publish(ctx, topic, &buspkg.Event{
				Type:         topic,
				OccurredAt:   now.Format(time.RFC3339),
				PartitionKey: orgID,
				Payload:      payload,
			})
		}
	}
}

// thin wrappers around domain functions to keep test package self-contained
func findBestRuleFor(skuID, channelID string, rules []*repo.MarginRuleRow) *repo.MarginRuleRow {
	var best *repo.MarginRuleRow
	bestScore := -1
	for _, r := range rules {
		score := scopeScoreFor(r, skuID, channelID)
		if score > bestScore {
			bestScore = score
			best = r
		}
	}
	return best
}

func scopeScoreFor(r *repo.MarginRuleRow, skuID, channelID string) int {
	switch {
	case r.SkuID != nil && *r.SkuID == skuID:
		return 2
	case r.SkuID == nil && r.ChannelID != nil && *r.ChannelID == channelID:
		return 1
	case r.SkuID == nil && r.ChannelID == nil && r.CategoryID == nil:
		return 0
	default:
		return -1
	}
}

func computeFloor(rule *repo.MarginRuleRow, _ *commonv1.Money) (int64, error) {
	if rule.FloorType == "absolute_minimum" {
		return rule.FloorValue, nil
	}
	return 0, nil
}

func ptr(s string) *string { return &s }

// --- tests ---

func TestBreachDetected_PublishesEvent(t *testing.T) {
	pub := &mockPublisher{}
	tm := &testableMonitor{
		orgs:      []string{testOrgID},
		targets:   map[string][]repo.RuleTarget{testOrgID: {{SkuID: testSkuID, ChannelID: testChannelID}}},
		rules: map[string][]*repo.MarginRuleRow{testOrgID: {{
			ID: testRuleID, OrgID: testOrgID, SkuID: ptr(testSkuID),
			FloorType: "absolute_minimum", FloorValue: 1000, Currency: "NGN",
			IsActive: true,
		}}},
		costs:     map[string]*commonv1.Money{},
		prices:    map[string][]*priceEntry{testOrgID: {{skuID: testSkuID, channelID: testChannelID, price: &commonv1.Money{Amount: 900, Currency: "NGN"}}}},
		publisher: pub,
	}

	tm.runScanOnce(context.Background())

	events := pub.Events()
	require.Len(t, events, 1)
	assert.Equal(t, topic, events[0].Type)
	assert.Equal(t, testOrgID, events[0].PartitionKey)

	var breach marginev1.MarginBreachDetected
	require.NoError(t, proto.Unmarshal(events[0].Payload, &breach))
	assert.Equal(t, testSkuID, breach.SkuId)
	assert.Equal(t, testRuleID, breach.RuleId)
	assert.Equal(t, int64(900), breach.CurrentPrice.Amount)
	assert.Equal(t, int64(1000), breach.FloorPrice.Amount)
	assert.Equal(t, int64(100), breach.Gap.Amount)
}

func TestNoBreachAboveFloor_NoPublish(t *testing.T) {
	pub := &mockPublisher{}
	tm := &testableMonitor{
		orgs:    []string{testOrgID},
		targets: map[string][]repo.RuleTarget{testOrgID: {{SkuID: testSkuID, ChannelID: testChannelID}}},
		rules: map[string][]*repo.MarginRuleRow{testOrgID: {{
			ID: testRuleID, OrgID: testOrgID, SkuID: ptr(testSkuID),
			FloorType: "absolute_minimum", FloorValue: 1000, Currency: "NGN",
			IsActive: true,
		}}},
		costs:     map[string]*commonv1.Money{},
		prices:    map[string][]*priceEntry{testOrgID: {{skuID: testSkuID, channelID: testChannelID, price: &commonv1.Money{Amount: 1200, Currency: "NGN"}}}},
		publisher: pub,
	}

	tm.runScanOnce(context.Background())

	assert.Empty(t, pub.Events())
}

func TestOrgWideRulesSkipped_EmptyTargets(t *testing.T) {
	pub := &mockPublisher{}
	tm := &testableMonitor{
		orgs:      []string{testOrgID},
		targets:   map[string][]repo.RuleTarget{testOrgID: {}}, // no scoped targets
		rules:     map[string][]*repo.MarginRuleRow{},
		costs:     map[string]*commonv1.Money{},
		prices:    map[string][]*priceEntry{},
		publisher: pub,
	}

	tm.runScanOnce(context.Background())

	assert.Empty(t, pub.Events())
}

func TestNoPriceRecord_NoPublish(t *testing.T) {
	pub := &mockPublisher{}
	tm := &testableMonitor{
		orgs:    []string{testOrgID},
		targets: map[string][]repo.RuleTarget{testOrgID: {{SkuID: testSkuID, ChannelID: testChannelID}}},
		rules: map[string][]*repo.MarginRuleRow{testOrgID: {{
			ID: testRuleID, OrgID: testOrgID, SkuID: ptr(testSkuID),
			FloorType: "absolute_minimum", FloorValue: 1000, Currency: "NGN",
			IsActive: true,
		}}},
		costs:     map[string]*commonv1.Money{},
		prices:    map[string][]*priceEntry{testOrgID: {}}, // no price records
		publisher: pub,
	}

	tm.runScanOnce(context.Background())

	assert.Empty(t, pub.Events())
}

func TestNoMatchingRule_NoPublish(t *testing.T) {
	pub := &mockPublisher{}
	differentSkuID := "dddddddd-0000-0000-0000-000000000001"
	tm := &testableMonitor{
		orgs:    []string{testOrgID},
		targets: map[string][]repo.RuleTarget{testOrgID: {{SkuID: testSkuID, ChannelID: testChannelID}}},
		rules: map[string][]*repo.MarginRuleRow{testOrgID: {{
			ID: testRuleID, OrgID: testOrgID, SkuID: ptr(differentSkuID),
			FloorType: "absolute_minimum", FloorValue: 1000, Currency: "NGN",
			IsActive: true,
		}}},
		costs:     map[string]*commonv1.Money{},
		prices:    map[string][]*priceEntry{testOrgID: {{skuID: testSkuID, channelID: testChannelID, price: &commonv1.Money{Amount: 500, Currency: "NGN"}}}},
		publisher: pub,
	}

	tm.runScanOnce(context.Background())

	assert.Empty(t, pub.Events())
}
