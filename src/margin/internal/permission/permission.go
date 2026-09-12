// Package permission names the RBAC permission codes Margin's own handlers
// check. Not the full 55-entry catalog (that lives in src/rbac/src/permissions.ts) —
// just the subset this service cares about, named to avoid magic strings at
// call sites.
package permission

const (
	// MarginGuardrailManage gates creating, editing or deactivating a margin rule.
	MarginGuardrailManage = "margin_guardrail.manage"
	// MarginGuardrailRead gates reading margin rules.
	MarginGuardrailRead = "margin_guardrail.read"
)
