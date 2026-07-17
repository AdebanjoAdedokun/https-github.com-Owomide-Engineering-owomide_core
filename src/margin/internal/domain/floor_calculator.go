package domain

import (
	"errors"
	"fmt"
	"math"

	commonv1 "github.com/owomide/proto/common/v1"

	"github.com/owomide/margin/internal/repo"
)

// ErrNoCost is returned when a percentage-based rule requires a cost but none was provided.
var ErrNoCost = errors.New("no cost record found for SKU")

// ErrCurrencyMismatch is returned when the rule currency differs from the cost currency
// in a way that makes floor computation impossible.
var ErrCurrencyMismatch = errors.New("currency mismatch between rule and cost")

// maxSafeCostAmount is the largest cost.Amount that can be multiplied by 10000
// without overflowing int64 (math.MaxInt64 / 10000).
const maxSafeCostAmount = int64(math.MaxInt64 / 10000)

// ComputeFloor returns the minimum acceptable price amount (in rule.Currency minor units).
//
// floor_value semantics per floor_type:
//   - pct_margin:        basis points (e.g. 2000 = 20% gross margin)
//   - pct_markup:        basis points (e.g. 2000 = 20% markup over cost)
//   - absolute_minimum:  minor units in rule.Currency
//
// All arithmetic is integer-only (ceiling division for pct types).
func ComputeFloor(rule *repo.MarginRuleRow, cost *commonv1.Money) (int64, error) {
	if cost != nil && cost.Currency != rule.Currency {
		return 0, fmt.Errorf("%w: rule=%s cost=%s", ErrCurrencyMismatch, rule.Currency, cost.Currency)
	}

	switch rule.FloorType {
	case "pct_margin":
		if cost == nil {
			return 0, ErrNoCost
		}
		if cost.Amount < 0 {
			return 0, fmt.Errorf("cost amount %d is negative — cannot compute margin floor", cost.Amount)
		}
		if cost.Amount > maxSafeCostAmount {
			return 0, fmt.Errorf("cost amount %d exceeds maximum safe value for floor calculation", cost.Amount)
		}
		// floor = ceil(cost / (1 - floor_value/10000))
		//       = ceil(cost * 10000 / (10000 - floor_value))
		denom := int64(10000) - rule.FloorValue
		if denom <= 0 {
			return 0, fmt.Errorf("pct_margin floor_value %d would imply infinite or negative floor", rule.FloorValue)
		}
		return ceilDiv(cost.Amount*10000, denom), nil

	case "pct_markup":
		if cost == nil {
			return 0, ErrNoCost
		}
		if cost.Amount < 0 {
			return 0, fmt.Errorf("cost amount %d is negative — cannot compute markup floor", cost.Amount)
		}
		if cost.Amount > maxSafeCostAmount {
			return 0, fmt.Errorf("cost amount %d exceeds maximum safe value for floor calculation", cost.Amount)
		}
		// floor = cost + ceil(cost * floor_value / 10000)
		return cost.Amount + ceilDiv(cost.Amount*rule.FloorValue, 10000), nil

	case "absolute_minimum":
		return rule.FloorValue, nil

	default:
		return 0, fmt.Errorf("unknown floor_type %q", rule.FloorType)
	}
}

// ceilDiv returns ceil(a/b) for non-negative a and positive b.
func ceilDiv(a, b int64) int64 {
	q, r := a/b, a%b
	if r > 0 {
		return q + 1
	}
	return q
}
