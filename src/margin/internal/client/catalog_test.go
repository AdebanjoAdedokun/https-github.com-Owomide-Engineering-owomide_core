package client

import (
	"context"
	"errors"
	"net"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/test/bufconn"

	commonv1 "github.com/owomide/proto/common/v1"
	catalogv1 "github.com/owomide/proto/services/catalog/v1"
)

const catalogClientSecret = "test-catalog-margin-secret-change-me"

type captureCatalogServer struct {
	catalogv1.UnimplementedCatalogServiceServer
	metadata chan metadata.MD
}

type noCallConn struct{}

func (*noCallConn) Invoke(context.Context, string, any, any, ...grpc.CallOption) error {
	return errors.New("unexpected RPC")
}

func (*noCallConn) NewStream(
	context.Context,
	*grpc.StreamDesc,
	string,
	...grpc.CallOption,
) (grpc.ClientStream, error) {
	return nil, errors.New("unexpected RPC")
}

func (s *captureCatalogServer) BatchGetCosts(
	ctx context.Context,
	_ *catalogv1.BatchGetCostsRequest,
) (*catalogv1.BatchGetCostsResponse, error) {
	md, _ := metadata.FromIncomingContext(ctx)
	s.metadata <- md
	return &catalogv1.BatchGetCostsResponse{Costs: []*catalogv1.CostRecord{{
		SkuId: "sku-1",
		Cost:  &commonv1.Money{Amount: 1234, Currency: "NGN"},
	}}}, nil
}

func TestCatalogClientSignsAndScopesRequest(t *testing.T) {
	listener := bufconn.Listen(1024 * 1024)
	serverImpl := &captureCatalogServer{metadata: make(chan metadata.MD, 1)}
	server := grpc.NewServer()
	catalogv1.RegisterCatalogServiceServer(server, serverImpl)
	go func() { _ = server.Serve(listener) }()
	t.Cleanup(server.Stop)

	conn, err := grpc.NewClient(
		"passthrough:///bufnet",
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithContextDialer(func(context.Context, string) (net.Conn, error) {
			return listener.Dial()
		}),
	)
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })

	client, err := NewCatalogClient(conn, catalogClientSecret, "owomide-internal", time.Second)
	require.NoError(t, err)
	costs, err := client.FetchCosts(context.Background(), "org-1", []string{"sku-1"})
	require.NoError(t, err)
	require.Equal(t, int64(1234), costs["sku-1"].Amount)

	md := <-serverImpl.metadata
	require.Equal(t, []string{"org-1"}, md.Get("x-org-id"))
	require.Equal(t, []string{"margin_svc"}, md.Get("x-user-id"))
	authorization := md.Get("authorization")
	require.Len(t, authorization, 1)
	require.True(t, strings.HasPrefix(authorization[0], "Bearer "))
	claims := jwt.MapClaims{}
	parsed, err := jwt.ParseWithClaims(
		strings.TrimPrefix(authorization[0], "Bearer "),
		claims,
		func(*jwt.Token) (any, error) { return []byte(catalogClientSecret), nil },
		jwt.WithValidMethods([]string{"HS256"}),
		jwt.WithIssuer("owomide-internal"),
		jwt.WithAudience("catalog"),
	)
	require.NoError(t, err)
	require.True(t, parsed.Valid)
	require.Equal(t, "margin_svc", claims["sub"])
}

func TestCatalogClientRejectsMissingOrganization(t *testing.T) {
	client, err := NewCatalogClient(
		&noCallConn{},
		catalogClientSecret,
		"owomide-internal",
		time.Second,
	)
	require.NoError(t, err)
	_, err = client.FetchCosts(context.Background(), " ", []string{"sku-1"})
	require.ErrorContains(t, err, "organization ID is required")
}
