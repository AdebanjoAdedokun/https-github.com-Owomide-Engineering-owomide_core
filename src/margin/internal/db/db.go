package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type DB struct {
	Pool *pgxpool.Pool
}

func New(databaseURL string) (*DB, error) {
	pool, err := pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}
	return &DB{Pool: pool}, nil
}

func (d *DB) Close() {
	d.Pool.Close()
}

// WithOrgTx runs fn inside a transaction with app.org_id set for RLS.
func (d *DB) WithOrgTx(ctx context.Context, orgID string, fn func(tx pgx.Tx) error) error {
	return pgx.BeginTxFunc(ctx, d.Pool, pgx.TxOptions{}, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "SELECT set_config('app.org_id', $1, true)", orgID); err != nil {
			return fmt.Errorf("set org_id: %w", err)
		}
		return fn(tx)
	})
}
