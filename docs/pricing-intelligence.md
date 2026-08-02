# Pricing Intelligence Rule Evaluation

F7.4 adds a stateless Python rule evaluator behind the internal `IntelligenceService`. Margin
continues to own tenant rules, cost retrieval, and violation policy. Intelligence owns condition
matching, precedence, exact floor arithmetic, and explainable evaluation output.

There is no Gateway route or frontend dependency. The service is registered on the existing Data
Pipeline gRPC server so it can be extracted into an independently scaled deployment later without
changing its contract.

## Contract

`EvaluateMarginBatch` accepts a bounded batch of typed rule definitions and evaluation items. It
returns one result for every item with:

- `matched`, `no_match`, or `error` status;
- applied rule ID and version;
- floor, proposed amount, gap, and violation state;
- all matching rule IDs in precedence order;
- engine version and a deterministic SHA-256 evaluation hash.

The hash covers the normalized item, every supplied rule, the outcome, and engine version. It is
stable when logically identical rules are sent in a different order. Margin propagates it into
proposal violations and `margin.breach_detected` events.

## Conditions and facts

Predicates are typed protobuf trees, not executable source code or unvalidated expression strings.
Groups support `all` and `any`; leaf conditions support equality, inequality, integer ordering,
set membership, and presence checks. Requests are bounded to:

- 500 rules;
- 1,000 items;
- 100 custom facts per item;
- 8 predicate levels and 128 predicate nodes per rule.

Built-in facts are `sku_id`, `channel_id`, `category_id`, `currency`,
`proposed_amount_minor`, and `cost_amount_minor`. Custom facts cannot replace built-ins. Strings,
signed 64-bit integers, and booleans remain distinct; booleans never compare as integers.

## Precedence

Applicable rules are ordered by:

1. explicit priority, descending;
2. condition count, descending;
3. rule ID, ascending.

The first rule is applied and all matching rule IDs are returned for explanation. Margin maps its
current persisted scopes to priorities: SKU `300`, channel `200`, category `100`, and organization
wide `0`. Duplicate rule IDs and malformed or ambiguous predicates reject the whole RPC.

## Money arithmetic

All amounts are signed 64-bit minor units and must be non-negative. Calculations use integer-only
ceiling arithmetic:

```text
percentage margin floor = ceil(cost * 10000 / (10000 - basis_points))
percentage markup floor = cost + ceil(cost * basis_points / 10000)
absolute floor          = configured minor-unit amount
```

Currency mismatches, missing costs, and computed 64-bit overflow are per-item error results. Margin
treats evaluator errors as blocking violations. Network failures, malformed result counts, missing
provenance, and internally inconsistent money fields fail the entire Margin request closed.

## Trust boundary

Only `margin_svc` may call `IntelligenceService`. It signs a short-lived HS256 service JWT for the
`data-pipeline` audience and sends trusted organization context through gRPC metadata. The request
body has no editable tenant field. Allowing `margin_svc` through the shared server interceptor does
not grant access to import or FX methods; those remain restricted to `gateway_svc`.

## Deliberately deferred

- Persisted authoring of arbitrary condition trees and custom fact enrichment.
- Catalog-backed category enrichment; the current Margin request path has SKU and channel context
  but does not yet resolve product category.
- Business-time and recorded-as-of rule/cost resolution. Margin currently supplies active rules and
  current Catalog costs, so historical replay is not yet reproducible end to end.
- Rule simulation history and `margin_rule_application` persistence.
- Pricing recommendations, demand elasticity, forecasting, competitor optimization, or ML.
- A separate Intelligence deployment; extraction should follow measured load or availability needs.

These extensions can use the typed evaluator contract without changing its deterministic core.
