package client

import (
	"context"
	"fmt"

	"google.golang.org/grpc"

	commonv1 "github.com/owomide/proto/common/v1"
	catalogv1 "github.com/owomide/proto/services/catalog/v1"
)

// CostFetcher retrieves current costs for a set of SKUs from Catalog.
// Returned map is keyed by sku_id; absent keys mean no cost record exists.
type CostFetcher interface {
	FetchCosts(ctx context.Context, orgID string, skuIDs []string) (map[string]*commonv1.Money, error)
}

type catalogClient struct {
	inner catalogv1.CatalogServiceClient
}

func NewCatalogClient(conn *grpc.ClientConn) CostFetcher {
	return &catalogClient{inner: catalogv1.NewCatalogServiceClient(conn)}
}

func (c *catalogClient) FetchCosts(ctx context.Context, _ string, skuIDs []string) (map[string]*commonv1.Money, error) {
	resp, err := c.inner.BatchGetCosts(ctx, &catalogv1.BatchGetCostsRequest{SkuIds: skuIDs})
	if err != nil {
		return nil, fmt.Errorf("catalog BatchGetCosts: %w", err)
	}
	out := make(map[string]*commonv1.Money, len(resp.Costs))
	for _, cr := range resp.Costs {
		if cr.Cost != nil {
			out[cr.SkuId] = cr.Cost
		}
	}
	return out, nil
}
