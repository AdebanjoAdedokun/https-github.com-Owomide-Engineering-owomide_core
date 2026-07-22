package integration_test

import (
	"context"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"

	buspkg "github.com/owomide/bus/pkg/bus"
	commonv1 "github.com/owomide/proto/common/v1"
	marginev1 "github.com/owomide/proto/events/margin"
	catalogv1 "github.com/owomide/proto/services/catalog/v1"

	"github.com/owomide/margin/internal/monitor"
	"github.com/owomide/margin/internal/repo"
)

// --- stubs ---

type stubPriceFetcher struct {
	records []*catalogv1.PriceRecord
}

func (s *stubPriceFetcher) FetchPrices(_ context.Context, _ string, _ []string, _ string) ([]*catalogv1.PriceRecord, error) {
	return s.records, nil
}

type mockBusPublisher struct {
	mu     sync.Mutex
	events []*buspkg.Event
}

func (m *mockBusPublisher) Publish(_ context.Context, _ string, event *buspkg.Event) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.events = append(m.events, event)
	return nil
}

func (m *mockBusPublisher) Close() error { return nil }

func (m *mockBusPublisher) captured() []*buspkg.Event {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]*buspkg.Event, len(m.events))
	copy(out, m.events)
	return out
}

// insertRule inserts a scoped margin rule via sharedDB.WithOrgTx and returns its ID.
func insertRule(ctx context.Context, t *testing.T, p repo.UpsertRuleParams) *repo.MarginRuleRow {
	t.Helper()
	var rule *repo.MarginRuleRow
	err := sharedDB.WithOrgTx(ctx, p.OrgID, func(tx pgx.Tx) error {
		var txErr error
		rule, txErr = sharedRepo.UpsertRule(ctx, tx, p)
		return txErr
	})
	require.NoError(t, err)
	require.NotNil(t, rule)
	return rule
}

func strPtr(s string) *string { return &s }

// --- tests ---

// TestBreachMonitor_ScanOnce_EmitsBreachEvent inserts a scoped rule with absolute
// floor 1000 NGN, feeds a stub price of 900, and expects one breach event.
func TestBreachMonitor_ScanOnce_EmitsBreachEvent(t *testing.T) {
	ctx := context.Background()

	const (
		org    = "00000000-0000-0000-0001-000000000001"
		skuID  = "eeeeeeee-0000-0000-0000-000000000001"
		chanID = "ffffffff-0000-0000-0000-000000000001"
	)

	rule := insertRule(ctx, t, repo.UpsertRuleParams{
		OrgID:       org,
		SkuID:       strPtr(skuID),
		ChannelID:   strPtr(chanID),
		FloorType:   "absolute_minimum",
		FloorValue:  1000,
		Currency:    "NGN",
		EffectiveAt: time.Now().Add(-time.Hour),
		CreatedBy:   "00000000-0000-0000-0000-000000000099",
	})

	pub := &mockBusPublisher{}
	mon := monitor.New(
		sharedDB,
		sharedRepo,
		&stubCostFetcher{},
		&stubPriceFetcher{records: []*catalogv1.PriceRecord{{
			SkuId:     skuID,
			ChannelId: chanID,
			Price:     &commonv1.Money{Amount: 900, Currency: "NGN"},
		}}},
		pub,
		time.Minute,
		100,
		slog.Default(),
	)

	require.NoError(t, mon.ScanOnce(ctx))

	events := pub.captured()
	require.Len(t, events, 1, "expected exactly one breach event")
	assert.Equal(t, "margin.breach_detected", events[0].Type)
	assert.Equal(t, org, events[0].PartitionKey)

	var breach marginev1.MarginBreachDetected
	require.NoError(t, proto.Unmarshal(events[0].Payload, &breach))
	assert.Equal(t, org, breach.OrgId)
	assert.Equal(t, skuID, breach.SkuId)
	assert.Equal(t, chanID, breach.ChannelId)
	assert.Equal(t, rule.ID, breach.RuleId)
	assert.Equal(t, int64(900), breach.CurrentPrice.Amount)
	assert.Equal(t, int64(1000), breach.FloorPrice.Amount)
	assert.Equal(t, int64(100), breach.Gap.Amount)
}

// TestBreachMonitor_ScanOnce_NoBreachWhenPriceAboveFloor verifies no event when
// the canonical price is above the rule floor.
func TestBreachMonitor_ScanOnce_NoBreachWhenPriceAboveFloor(t *testing.T) {
	ctx := context.Background()

	const (
		org    = "00000000-0000-0000-0002-000000000001"
		skuID  = "11111111-aaaa-0000-0000-000000000001"
		chanID = "22222222-aaaa-0000-0000-000000000001"
	)

	insertRule(ctx, t, repo.UpsertRuleParams{
		OrgID:       org,
		SkuID:       strPtr(skuID),
		ChannelID:   strPtr(chanID),
		FloorType:   "absolute_minimum",
		FloorValue:  1000,
		Currency:    "NGN",
		EffectiveAt: time.Now().Add(-time.Hour),
		CreatedBy:   "00000000-0000-0000-0000-000000000099",
	})

	pub := &mockBusPublisher{}
	mon := monitor.New(
		sharedDB,
		sharedRepo,
		&stubCostFetcher{},
		&stubPriceFetcher{records: []*catalogv1.PriceRecord{{
			SkuId:     skuID,
			ChannelId: chanID,
			Price:     &commonv1.Money{Amount: 1500, Currency: "NGN"},
		}}},
		pub,
		time.Minute,
		100,
		slog.Default(),
	)

	require.NoError(t, mon.ScanOnce(ctx))
	assert.Empty(t, pub.captured())
}
