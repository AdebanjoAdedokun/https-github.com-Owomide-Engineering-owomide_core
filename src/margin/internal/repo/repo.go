package repo

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type MarginRuleRow struct {
	ID             string
	OrgID          string
	ChannelID      *string
	CategoryID     *string
	SkuID          *string
	FloorType      string
	FloorValue     int64
	Currency       string
	EffectiveAt    time.Time
	EffectiveUntil *time.Time
	CreatedBy      string
	Version        int32
	IsActive       bool
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type UpsertRuleParams struct {
	ID             string
	OrgID          string
	ChannelID      *string
	CategoryID     *string
	SkuID          *string
	FloorType      string
	FloorValue     int64
	Currency       string
	EffectiveAt    time.Time
	EffectiveUntil *time.Time
	CreatedBy      string
}

type ListRulesParams struct {
	ChannelID  *string
	CategoryID *string
	SkuID      *string
	PageSize   int
	CursorAt   *time.Time
	CursorID   *string
}

type Repo struct{}

func New() *Repo { return &Repo{} }

func (r *Repo) UpsertRule(ctx context.Context, tx pgx.Tx, p UpsertRuleParams) (*MarginRuleRow, error) {
	if p.ID == "" {
		// New rule — let the DB generate a UUID.
		row := tx.QueryRow(ctx, `
			INSERT INTO margin.margin_rule
			  (org_id, channel_id, category_id, sku_id, floor_type, floor_value,
			   currency, effective_at, effective_until, created_by)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			RETURNING id, org_id, channel_id, category_id, sku_id, floor_type, floor_value,
			          currency, effective_at, effective_until, created_by, version,
			          is_active, created_at, updated_at`,
			p.OrgID, p.ChannelID, p.CategoryID, p.SkuID,
			p.FloorType, p.FloorValue, p.Currency,
			p.EffectiveAt, p.EffectiveUntil, p.CreatedBy,
		)
		return scanRule(row)
	}

	// Update existing rule by id.
	row := tx.QueryRow(ctx, `
		INSERT INTO margin.margin_rule
		  (id, org_id, channel_id, category_id, sku_id, floor_type, floor_value,
		   currency, effective_at, effective_until, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		ON CONFLICT (id) DO UPDATE SET
		  channel_id      = EXCLUDED.channel_id,
		  category_id     = EXCLUDED.category_id,
		  sku_id          = EXCLUDED.sku_id,
		  floor_type      = EXCLUDED.floor_type,
		  floor_value     = EXCLUDED.floor_value,
		  currency        = EXCLUDED.currency,
		  effective_at    = EXCLUDED.effective_at,
		  effective_until = EXCLUDED.effective_until,
		  version         = margin.margin_rule.version + 1,
		  updated_at      = clock_timestamp()
		RETURNING id, org_id, channel_id, category_id, sku_id, floor_type, floor_value,
		          currency, effective_at, effective_until, created_by, version,
		          is_active, created_at, updated_at`,
		p.ID, p.OrgID, p.ChannelID, p.CategoryID, p.SkuID,
		p.FloorType, p.FloorValue, p.Currency,
		p.EffectiveAt, p.EffectiveUntil, p.CreatedBy,
	)
	return scanRule(row)
}

func (r *Repo) DeactivateRule(ctx context.Context, tx pgx.Tx, id string) (*MarginRuleRow, error) {
	row := tx.QueryRow(ctx, `
		UPDATE margin.margin_rule
		SET is_active = false, effective_until = clock_timestamp(), updated_at = clock_timestamp()
		WHERE id = $1
		RETURNING id, org_id, channel_id, category_id, sku_id, floor_type, floor_value,
		          currency, effective_at, effective_until, created_by, version,
		          is_active, created_at, updated_at`,
		id,
	)
	result, err := scanRule(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return result, nil
}

func (r *Repo) ListRules(ctx context.Context, tx pgx.Tx, p ListRulesParams) ([]*MarginRuleRow, error) {
	limit := p.PageSize
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	args := []any{}
	where := "WHERE is_active = true"

	if p.ChannelID != nil {
		args = append(args, *p.ChannelID)
		where += " AND channel_id = $" + itoa(len(args))
	}
	if p.CategoryID != nil {
		args = append(args, *p.CategoryID)
		where += " AND category_id = $" + itoa(len(args))
	}
	if p.SkuID != nil {
		args = append(args, *p.SkuID)
		where += " AND sku_id = $" + itoa(len(args))
	}
	if p.CursorAt != nil && p.CursorID != nil {
		args = append(args, *p.CursorAt, *p.CursorID)
		where += " AND (created_at, id) < ($" + itoa(len(args)-1) + "::timestamptz, $" + itoa(len(args)) + "::uuid)"
	}
	args = append(args, limit+1)

	rows, err := tx.Query(ctx, `
		SELECT id, org_id, channel_id, category_id, sku_id, floor_type, floor_value,
		       currency, effective_at, effective_until, created_by, version,
		       is_active, created_at, updated_at
		FROM margin.margin_rule `+where+`
		ORDER BY created_at DESC, id DESC
		LIMIT $`+itoa(len(args)),
		args...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*MarginRuleRow
	for rows.Next() {
		r := &MarginRuleRow{}
		if err := rows.Scan(
			&r.ID, &r.OrgID, &r.ChannelID, &r.CategoryID, &r.SkuID,
			&r.FloorType, &r.FloorValue, &r.Currency,
			&r.EffectiveAt, &r.EffectiveUntil, &r.CreatedBy,
			&r.Version, &r.IsActive, &r.CreatedAt, &r.UpdatedAt,
		); err != nil {
			return nil, err
		}
		results = append(results, r)
	}
	return results, rows.Err()
}

// GetRulesForBatch returns all active, temporally-valid rules that could match
// any SKU or channel in the provided lists, plus org-wide rules (no scope set).
// RLS (via app.org_id on the transaction) automatically restricts to the caller's org.
func (r *Repo) GetRulesForBatch(ctx context.Context, tx pgx.Tx, skuIDs, channelIDs []string) ([]*MarginRuleRow, error) {
	rows, err := tx.Query(ctx, `
		SELECT id, org_id, channel_id, category_id, sku_id, floor_type, floor_value,
		       currency, effective_at, effective_until, created_by, version,
		       is_active, created_at, updated_at
		FROM margin.margin_rule
		WHERE is_active = true
		  AND effective_at <= clock_timestamp()
		  AND (effective_until IS NULL OR effective_until > clock_timestamp())
		  AND (
		    sku_id = ANY($1::uuid[])
		    OR (channel_id = ANY($2::uuid[]) AND sku_id IS NULL)
		    OR (sku_id IS NULL AND channel_id IS NULL AND category_id IS NULL)
		  )`,
		skuIDs, channelIDs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*MarginRuleRow
	for rows.Next() {
		row := &MarginRuleRow{}
		if err := rows.Scan(
			&row.ID, &row.OrgID, &row.ChannelID, &row.CategoryID, &row.SkuID,
			&row.FloorType, &row.FloorValue, &row.Currency,
			&row.EffectiveAt, &row.EffectiveUntil, &row.CreatedBy,
			&row.Version, &row.IsActive, &row.CreatedAt, &row.UpdatedAt,
		); err != nil {
			return nil, err
		}
		results = append(results, row)
	}
	return results, rows.Err()
}

// GetMonitoredOrgs returns all org_ids with at least one currently active scoped rule.
// Calls a SECURITY DEFINER function to bypass RLS — no app.org_id session var needed.
func (r *Repo) GetMonitoredOrgs(ctx context.Context, pool *pgxpool.Pool) ([]string, error) {
	rows, err := pool.Query(ctx, "SELECT org_id FROM margin.get_monitored_orgs()")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// RuleTarget is a (sku_id, channel_id) pair covered by a scoped margin rule.
type RuleTarget struct {
	SkuID     string
	ChannelID string
}

// GetRuleTargets returns (sku_id, channel_id) pairs covered by scoped rules for a given org.
// Org-wide rules are excluded — callers receive only pairs with both fields set.
// Calls a SECURITY DEFINER function to bypass RLS.
func (r *Repo) GetRuleTargets(ctx context.Context, pool *pgxpool.Pool, orgID string) ([]RuleTarget, error) {
	rows, err := pool.Query(ctx, "SELECT sku_id, channel_id FROM margin.get_rule_targets($1::uuid)", orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []RuleTarget
	for rows.Next() {
		var t RuleTarget
		if err := rows.Scan(&t.SkuID, &t.ChannelID); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func scanRule(row pgx.Row) (*MarginRuleRow, error) {
	r := &MarginRuleRow{}
	err := row.Scan(
		&r.ID, &r.OrgID, &r.ChannelID, &r.CategoryID, &r.SkuID,
		&r.FloorType, &r.FloorValue, &r.Currency,
		&r.EffectiveAt, &r.EffectiveUntil, &r.CreatedBy,
		&r.Version, &r.IsActive, &r.CreatedAt, &r.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return r, nil
}

func itoa(n int) string {
	return strconv.Itoa(n)
}
