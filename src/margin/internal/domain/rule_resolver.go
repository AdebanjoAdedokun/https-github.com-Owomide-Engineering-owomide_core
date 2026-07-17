package domain

import "github.com/owomide/margin/internal/repo"

// FindBestRule returns the single most-specific matching rule for a SKU + channel.
// Precedence: sku_id match > channel_id match > org-wide (all scope fields null).
// Returns nil when no rule matches.
func FindBestRule(skuID, channelID string, rules []*repo.MarginRuleRow) *repo.MarginRuleRow {
	var best *repo.MarginRuleRow
	bestScore := -1

	for _, r := range rules {
		score := scopeScore(r, skuID, channelID)
		if score < 0 {
			continue
		}
		if score > bestScore {
			bestScore = score
			best = r
		}
	}
	return best
}

// scopeScore returns how specifically a rule matches. Higher = more specific.
// -1 means no match.
func scopeScore(r *repo.MarginRuleRow, skuID, channelID string) int {
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
