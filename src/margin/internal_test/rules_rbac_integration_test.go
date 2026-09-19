package integration_test

import (
	"context"
	"log/slog"
	"net"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	"github.com/owomide/margin/internal/auth"
	"github.com/owomide/margin/internal/handler"
	marginpb "github.com/owomide/proto/services/margin/v1"
	rbacv1 "github.com/owomide/proto/services/rbac/v1"
)

// stubPermissionChecker mirrors the CSV: only finance_approver may manage
// margin guardrails.
type stubPermissionChecker struct{}

func (stubPermissionChecker) HasPermission(_ context.Context, _ string, roles []string, permission rbacv1.Permission) (bool, error) {
	if permission != rbacv1.Permission_PERMISSION_MARGIN_GUARDRAIL_MANAGE {
		return false, nil
	}
	for _, r := range roles {
		if r == "finance_approver" {
			return true, nil
		}
	}
	return false, nil
}

// startGatedClient stands up a second in-process server sharing the same DB,
// but with a real PermissionChecker wired in — proving the RBAC gate itself,
// independent of the no-op-when-nil tests above.
func startGatedClient(t *testing.T) marginpb.MarginServiceClient {
	t.Helper()
	svc := handler.NewRulesServer(
		sharedDB,
		sharedRepo,
		slog.Default(),
		&stubCostFetcher{},
		&stubMarginEvaluator{},
		stubPermissionChecker{},
	)
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	authenticator, err := newTestAuthenticator()
	if err != nil {
		t.Fatalf("authenticator: %v", err)
	}
	s := grpc.NewServer(grpc.UnaryInterceptor(authenticator.UnaryServerInterceptor()))
	marginpb.RegisterMarginServiceServer(s, svc)
	go func() { _ = s.Serve(lis) }()
	t.Cleanup(s.Stop)

	conn, err := grpc.NewClient(lis.Addr().String(), grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatalf("grpc dial: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return marginpb.NewMarginServiceClient(conn)
}

func ctxOrgWithRole(orgID, role string) context.Context {
	signer, err := auth.NewSigner("gateway_svc", testIssuer, testServiceSecret)
	if err != nil {
		panic("signer: " + err.Error())
	}
	token, err := signer.Token("margin", time.Now())
	if err != nil {
		panic("token: " + err.Error())
	}
	md := metadata.Pairs(
		"authorization", "Bearer "+token,
		"x-org-id", orgID,
		"x-user-id", "00000000-0000-0000-0000-000000000099",
		"x-user-roles", role,
	)
	return metadata.NewOutgoingContext(context.Background(), md)
}

func TestUpsertRule_DeniedWithoutMarginGuardrailManage(t *testing.T) {
	client := startGatedClient(t)
	_, err := client.UpsertRule(ctxOrgWithRole(orgA, "viewer"), &marginpb.UpsertRuleRequest{
		Rule: &marginpb.MarginRule{
			FloorType:  marginpb.FloorType_FLOOR_TYPE_ABSOLUTE_MINIMUM,
			FloorValue: 100,
			Currency:   "NGN",
		},
	})
	if status.Code(err) != codes.PermissionDenied {
		t.Fatalf("expected PermissionDenied, got %v", err)
	}
}

func TestUpsertRule_AllowedForFinanceApprover(t *testing.T) {
	client := startGatedClient(t)
	_, err := client.UpsertRule(ctxOrgWithRole(orgA, "finance_approver"), &marginpb.UpsertRuleRequest{
		Rule: &marginpb.MarginRule{
			FloorType:  marginpb.FloorType_FLOOR_TYPE_ABSOLUTE_MINIMUM,
			FloorValue: 150,
			Currency:   "NGN",
		},
	})
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
}
