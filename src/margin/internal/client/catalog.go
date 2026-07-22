package client

import (
	"context"
	"fmt"

	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"

	commonv1 "github.com/owomide/proto/common/v1"
	catalogv1 "github.com/owomide/proto/services/catalog/v1"
)

// CostFetcher retrieves current costs for a set of SKUs from Catalog.
// Returned map is keyed by sku_id; absent keys mean no cost record exists.
type CostFetcher interface {
	FetchCosts(ctx context.Context, orgID string, skuIDs []string) (map[string]*commonv1.Money, error)
}

// PriceFetcher retrieves current canonical prices for a set of SKUs from Catalog.
// When channelID is empty, prices across all channels are returned.
// Returned slice preserves order from Catalog; callers index by (sku_id, channel_id).
type PriceFetcher interface {
	FetchPrices(ctx context.Context, orgID string, skuIDs []string, channelID string) ([]*catalogv1.PriceRecord, error)
}

// CatalogClient implements both CostFetcher and PriceFetcher.
type CatalogClient interface {
	CostFetcher
	PriceFetcher
}

type catalogClient struct {
	inner catalogv1.CatalogServiceClient
}

func NewCatalogClient(conn *grpc.ClientConn) CatalogClient {
	return &catalogClient{inner: catalogv1.NewCatalogServiceClient(conn)}
}

func (c *catalogClient) FetchCosts(ctx context.Context, orgID string, skuIDs []string) (map[string]*commonv1.Money, error) {
	ctx = metadata.AppendToOutgoingContext(ctx, "x-org-id", orgID)
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

func (c *catalogClient) FetchPrices(ctx context.Context, orgID string, skuIDs []string, channelID string) ([]*catalogv1.PriceRecord, error) {
	ctx = metadata.AppendToOutgoingContext(ctx, "x-org-id", orgID)
	req := &catalogv1.BatchGetPricesRequest{SkuIds: skuIDs}
	if channelID != "" {
		req.ChannelId = &channelID
	}
	resp, err := c.inner.BatchGetPrices(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("catalog BatchGetPrices: %w", err)
	}
	return resp.Prices, nil
}
