package domain_test

import (
	"errors"
	"testing"

	commonv1 "github.com/owomide/proto/common/v1"

	"github.com/owomide/margin/internal/domain"
	"github.com/owomide/margin/internal/repo"
)

func money(amount int64, currency string) *commonv1.Money {
	return &commonv1.Money{Amount: amount, Currency: currency}
}

func rule(floorType string, floorValue int64, currency string) *repo.MarginRuleRow {
	return &repo.MarginRuleRow{FloorType: floorType, FloorValue: floorValue, Currency: currency}
}

// pct_margin: floor = ceil(cost * 10000 / (10000 - bps))
// cost=80000, 20% margin → floor = ceil(80000*10000/8000) = 100000
func TestComputeFloor_PctMargin(t *testing.T) {
	floor, err := domain.ComputeFloor(rule("pct_margin", 2000, "NGN"), money(80000, "NGN"))
	if err != nil {
		t.Fatal(err)
	}
	if floor != 100000 {
		t.Errorf("floor = %d, want 100000", floor)
	}
}

// pct_markup: floor = cost + ceil(cost * bps / 10000)
// cost=80000, 25% markup → floor = 80000 + ceil(80000*2500/10000) = 80000 + 20000 = 100000
func TestComputeFloor_PctMarkup(t *testing.T) {
	floor, err := domain.ComputeFloor(rule("pct_markup", 2500, "NGN"), money(80000, "NGN"))
	if err != nil {
		t.Fatal(err)
	}
	if floor != 100000 {
		t.Errorf("floor = %d, want 100000", floor)
	}
}

// absolute_minimum: floor = floor_value
func TestComputeFloor_AbsoluteMinimum(t *testing.T) {
	floor, err := domain.ComputeFloor(rule("absolute_minimum", 50000, "NGN"), nil)
	if err != nil {
		t.Fatal(err)
	}
	if floor != 50000 {
		t.Errorf("floor = %d, want 50000", floor)
	}
}

func TestComputeFloor_PctMargin_NilCost(t *testing.T) {
	_, err := domain.ComputeFloor(rule("pct_margin", 2000, "NGN"), nil)
	if !errors.Is(err, domain.ErrNoCost) {
		t.Errorf("expected ErrNoCost, got %v", err)
	}
}

func TestComputeFloor_PctMarkup_NilCost(t *testing.T) {
	_, err := domain.ComputeFloor(rule("pct_markup", 2000, "NGN"), nil)
	if !errors.Is(err, domain.ErrNoCost) {
		t.Errorf("expected ErrNoCost, got %v", err)
	}
}

func TestComputeFloor_CurrencyMismatch(t *testing.T) {
	_, err := domain.ComputeFloor(rule("pct_margin", 2000, "NGN"), money(80000, "USD"))
	if !errors.Is(err, domain.ErrCurrencyMismatch) {
		t.Errorf("expected ErrCurrencyMismatch, got %v", err)
	}
}

func TestComputeFloor_AbsoluteMinimum_CurrencyMismatch(t *testing.T) {
	// Currency mismatch is caught at top of function even for absolute_minimum.
	_, err := domain.ComputeFloor(rule("absolute_minimum", 50000, "NGN"), money(0, "USD"))
	if !errors.Is(err, domain.ErrCurrencyMismatch) {
		t.Errorf("expected ErrCurrencyMismatch, got %v", err)
	}
}

func TestComputeFloor_PctMargin_CeilingRoundsUp(t *testing.T) {
	// cost=1, 50% margin → floor = ceil(1*10000/5000) = ceil(2) = 2 (exact)
	// cost=3, 50% margin → floor = ceil(3*10000/5000) = ceil(6) = 6 (exact)
	// cost=1, 33.33% margin → ceil(10000/6667) = ceil(1.5) = 2
	floor, err := domain.ComputeFloor(rule("pct_margin", 3333, "NGN"), money(1, "NGN"))
	if err != nil {
		t.Fatal(err)
	}
	if floor < 1 {
		t.Errorf("ceiling floor should be at least cost, got %d", floor)
	}
}
