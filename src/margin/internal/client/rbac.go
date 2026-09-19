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
	rbacv1 "github.com/owomide/proto/services/rbac/v1"
)

// PermissionChecker asks the rbac service whether roles grant a permission.
// Permission is the generated enum from src/lib/proto/services/rbac/v1/rbac.proto —
// the single shared definition every service imports, rather than each
// service hardcoding its own permission strings.
type PermissionChecker interface {
	HasPermission(ctx context.Context, orgID string, roles []string, permission rbacv1.Permission) (bool, error)
}

type rbacClient struct {
	inner   rbacv1.RbacServiceClient
	signer  *auth.Signer
	timeout time.Duration
}

func NewRbacClient(
	conn grpc.ClientConnInterface,
	secret string,
	issuer string,
	timeout time.Duration,
) (PermissionChecker, error) {
	if conn == nil {
		return nil, errors.New("rbac gRPC connection is required")
	}
	if timeout <= 0 {
		return nil, errors.New("rbac timeout must be positive")
	}
	signer, err := auth.NewSigner("margin_svc", issuer, secret)
	if err != nil {
		return nil, fmt.Errorf("configure rbac service credential: %w", err)
	}
	return &rbacClient{
		inner:   rbacv1.NewRbacServiceClient(conn),
		signer:  signer,
		timeout: timeout,
	}, nil
}

func (c *rbacClient) HasPermission(ctx context.Context, orgID string, roles []string, permission rbacv1.Permission) (bool, error) {
	if strings.TrimSpace(orgID) == "" {
		return false, errors.New("organization ID is required")
	}
	token, err := c.signer.Token("rbac", time.Now())
	if err != nil {
		return false, fmt.Errorf("sign rbac credential: %w", err)
	}
	callCtx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()
	callCtx = metadata.NewOutgoingContext(
		callCtx,
		metadata.Pairs(
			"authorization", "Bearer "+token,
			"x-org-id", orgID,
			"x-user-id", "margin_svc",
		),
	)
	resp, err := c.inner.CheckPermission(callCtx, &rbacv1.CheckPermissionRequest{
		Roles:      roles,
		Permission: permission,
	})
	if err != nil {
		return false, fmt.Errorf("rbac CheckPermission: %w", err)
	}
	return resp.GetAllowed(), nil
}
