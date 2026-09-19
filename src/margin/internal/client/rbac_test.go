package client

import (
	"context"
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

	rbacv1 "github.com/owomide/proto/services/rbac/v1"
)

const rbacClientSecret = "test-rbac-margin-secret-change-me"

type captureRbacServer struct {
	rbacv1.UnimplementedRbacServiceServer
	metadata chan metadata.MD
	request  chan *rbacv1.CheckPermissionRequest
	allowed  bool
}

func (s *captureRbacServer) CheckPermission(
	ctx context.Context,
	req *rbacv1.CheckPermissionRequest,
) (*rbacv1.CheckPermissionResponse, error) {
	md, _ := metadata.FromIncomingContext(ctx)
	s.metadata <- md
	s.request <- req
	return &rbacv1.CheckPermissionResponse{Allowed: s.allowed}, nil
}

func dialRbacServer(t *testing.T, impl *captureRbacServer) grpc.ClientConnInterface {
	t.Helper()
	listener := bufconn.Listen(1024 * 1024)
	server := grpc.NewServer()
	rbacv1.RegisterRbacServiceServer(server, impl)
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
	return conn
}

func TestRbacClientSignsScopesAndForwardsRolesAndPermission(t *testing.T) {
	impl := &captureRbacServer{
		metadata: make(chan metadata.MD, 1),
		request:  make(chan *rbacv1.CheckPermissionRequest, 1),
		allowed:  true,
	}
	conn := dialRbacServer(t, impl)

	client, err := NewRbacClient(conn, rbacClientSecret, "owomide-internal", time.Second)
	require.NoError(t, err)
	allowed, err := client.HasPermission(context.Background(), "org-1", []string{"finance_approver"}, rbacv1.Permission_PERMISSION_MARGIN_GUARDRAIL_MANAGE)
	require.NoError(t, err)
	require.True(t, allowed)

	md := <-impl.metadata
	require.Equal(t, []string{"org-1"}, md.Get("x-org-id"))
	require.Equal(t, []string{"margin_svc"}, md.Get("x-user-id"))
	authorization := md.Get("authorization")
	require.Len(t, authorization, 1)
	require.True(t, strings.HasPrefix(authorization[0], "Bearer "))

	claims := jwt.MapClaims{}
	parsed, err := jwt.ParseWithClaims(
		strings.TrimPrefix(authorization[0], "Bearer "),
		claims,
		func(*jwt.Token) (any, error) { return []byte(rbacClientSecret), nil },
		jwt.WithValidMethods([]string{"HS256"}),
		jwt.WithIssuer("owomide-internal"),
		jwt.WithAudience("rbac"),
	)
	require.NoError(t, err)
	require.True(t, parsed.Valid)
	require.Equal(t, "margin_svc", claims["sub"])

	req := <-impl.request
	require.Equal(t, []string{"finance_approver"}, req.GetRoles())
	require.Equal(t, rbacv1.Permission_PERMISSION_MARGIN_GUARDRAIL_MANAGE, req.GetPermission())
}

func TestRbacClientReturnsDenied(t *testing.T) {
	impl := &captureRbacServer{
		metadata: make(chan metadata.MD, 1),
		request:  make(chan *rbacv1.CheckPermissionRequest, 1),
		allowed:  false,
	}
	conn := dialRbacServer(t, impl)

	client, err := NewRbacClient(conn, rbacClientSecret, "owomide-internal", time.Second)
	require.NoError(t, err)
	allowed, err := client.HasPermission(context.Background(), "org-1", []string{"viewer"}, rbacv1.Permission_PERMISSION_MARGIN_GUARDRAIL_MANAGE)
	require.NoError(t, err)
	require.False(t, allowed)
}

func TestRbacClientRejectsMissingOrganization(t *testing.T) {
	client, err := NewRbacClient(&noCallConn{}, rbacClientSecret, "owomide-internal", time.Second)
	require.NoError(t, err)
	_, err = client.HasPermission(context.Background(), " ", []string{"finance_approver"}, rbacv1.Permission_PERMISSION_MARGIN_GUARDRAIL_MANAGE)
	require.ErrorContains(t, err, "organization ID is required")
}
