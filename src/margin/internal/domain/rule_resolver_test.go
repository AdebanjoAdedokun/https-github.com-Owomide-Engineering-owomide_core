package domain_test

import (
	"testing"

	"github.com/owomide/margin/internal/domain"
	"github.com/owomide/margin/internal/repo"
)

func strPtr(s string) *string { return &s }

func TestFindBestRule_SkuWinsOverChannel(t *testing.T) {
	skuID, chanID := "sku-1", "chan-1"
	rules := []*repo.MarginRuleRow{
		{ID: "org-wide", FloorType: "absolute_minimum", FloorValue: 100},
		{ID: "chan-rule", ChannelID: strPtr(chanID), FloorType: "absolute_minimum", FloorValue: 200},
		{ID: "sku-rule", SkuID: strPtr(skuID), FloorType: "absolute_minimum", FloorValue: 300},
	}
	got := domain.FindBestRule(skuID, chanID, rules)
	if got == nil || got.ID != "sku-rule" {
		t.Errorf("expected sku-rule, got %v", got)
	}
}

func TestFindBestRule_ChannelWinsOverOrgWide(t *testing.T) {
	chanID := "chan-1"
	rules := []*repo.MarginRuleRow{
		{ID: "org-wide", FloorType: "absolute_minimum", FloorValue: 100},
		{ID: "chan-rule", ChannelID: strPtr(chanID), FloorType: "absolute_minimum", FloorValue: 200},
	}
	got := domain.FindBestRule("sku-99", chanID, rules)
	if got == nil || got.ID != "chan-rule" {
		t.Errorf("expected chan-rule, got %v", got)
	}
}

func TestFindBestRule_OrgWideWhenNoOtherMatch(t *testing.T) {
	rules := []*repo.MarginRuleRow{
		{ID: "org-wide", FloorType: "absolute_minimum", FloorValue: 100},
	}
	got := domain.FindBestRule("sku-99", "chan-99", rules)
	if got == nil || got.ID != "org-wide" {
		t.Errorf("expected org-wide, got %v", got)
	}
}

func TestFindBestRule_NoMatchReturnsNil(t *testing.T) {
	rules := []*repo.MarginRuleRow{
		{ID: "chan-rule", ChannelID: strPtr("chan-other"), FloorType: "absolute_minimum", FloorValue: 200},
	}
	got := domain.FindBestRule("sku-99", "chan-99", rules)
	if got != nil {
		t.Errorf("expected nil, got %v", got)
	}
}

func TestFindBestRule_EmptyRules(t *testing.T) {
	got := domain.FindBestRule("sku-1", "chan-1", nil)
	if got != nil {
		t.Errorf("expected nil for empty rules, got %v", got)
	}
}

func TestFindBestRule_SkuRuleMatchesRegardlessOfChannel(t *testing.T) {
	skuID := "sku-1"
	skuRule := &repo.MarginRuleRow{ID: "sku-rule", SkuID: strPtr(skuID), FloorType: "absolute_minimum", FloorValue: 300}
	channelRule := &repo.MarginRuleRow{ID: "chan-rule", ChannelID: strPtr("chan-other"), FloorType: "absolute_minimum", FloorValue: 200}

	got := domain.FindBestRule(skuID, "chan-99", []*repo.MarginRuleRow{channelRule, skuRule})
	if got == nil || got.ID != "sku-rule" {
		t.Errorf("expected sku-rule, got %v", got)
	}
}
