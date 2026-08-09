package client

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"

	"github.com/owomide/margin/internal/auth"
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
	inner   catalogv1.CatalogServiceClient
	signer  *auth.Signer
	timeout time.Duration
}

func NewCatalogClient(
	conn grpc.ClientConnInterface,
	secret string,
	issuer string,
	timeout time.Duration,
) (CatalogClient, error) {
	if conn == nil {
		return nil, errors.New("catalog gRPC connection is required")
	}
	if timeout <= 0 {
		return nil, errors.New("catalog timeout must be positive")
	}
	signer, err := auth.NewSigner("margin_svc", issuer, secret)
	if err != nil {
		return nil, fmt.Errorf("configure catalog service credential: %w", err)
	}
	return &catalogClient{
		inner:   catalogv1.NewCatalogServiceClient(conn),
		signer:  signer,
		timeout: timeout,
	}, nil
}

func (c *catalogClient) FetchCosts(ctx context.Context, orgID string, skuIDs []string) (map[string]*commonv1.Money, error) {
	callCtx, cancel, err := c.requestContext(ctx, orgID)
	if err != nil {
		return nil, err
	}
	defer cancel()
	resp, err := c.inner.BatchGetCosts(callCtx, &catalogv1.BatchGetCostsRequest{SkuIds: skuIDs})
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
	callCtx, cancel, err := c.requestContext(ctx, orgID)
	if err != nil {
		return nil, err
	}
	defer cancel()
	req := &catalogv1.BatchGetPricesRequest{SkuIds: skuIDs}
	if channelID != "" {
		req.ChannelId = &channelID
	}
	resp, err := c.inner.BatchGetPrices(callCtx, req)
	if err != nil {
		return nil, fmt.Errorf("catalog BatchGetPrices: %w", err)
	}
	return resp.Prices, nil
}

func (c *catalogClient) requestContext(
	ctx context.Context,
	orgID string,
) (context.Context, context.CancelFunc, error) {
	if strings.TrimSpace(orgID) == "" {
		return nil, nil, errors.New("organization ID is required")
	}
	token, err := c.signer.Token("catalog", time.Now())
	if err != nil {
		return nil, nil, fmt.Errorf("sign catalog credential: %w", err)
	}
	callCtx, cancel := context.WithTimeout(ctx, c.timeout)
	callCtx = metadata.NewOutgoingContext(
		callCtx,
		metadata.Pairs(
			"authorization", "Bearer "+token,
			"x-org-id", orgID,
			"x-user-id", "margin_svc",
		),
	)
	return callCtx, cancel, nil
}
