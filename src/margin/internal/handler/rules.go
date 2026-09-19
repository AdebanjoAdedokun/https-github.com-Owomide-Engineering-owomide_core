package handler

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/owomide/margin/internal/auth"
	"github.com/owomide/margin/internal/client"
	"github.com/owomide/margin/internal/db"
	"github.com/owomide/margin/internal/repo"
	marginpb "github.com/owomide/proto/services/margin/v1"
	rbacv1 "github.com/owomide/proto/services/rbac/v1"
)

type RulesServer struct {
	marginpb.UnimplementedMarginServiceServer
	db          *db.DB
	repo        *repo.Repo
	logger      *slog.Logger
	costFetcher client.CostFetcher
	evaluator   client.MarginEvaluator
	permissions client.PermissionChecker
}

func NewRulesServer(
	database *db.DB,
	r *repo.Repo,
	logger *slog.Logger,
	costFetcher client.CostFetcher,
	evaluator client.MarginEvaluator,
	permissions client.PermissionChecker,
) *RulesServer {
	if costFetcher == nil {
		panic("NewRulesServer: costFetcher must not be nil")
	}
	if evaluator == nil {
		panic("NewRulesServer: evaluator must not be nil")
	}
	return &RulesServer{
		db: database, repo: r, logger: logger, costFetcher: costFetcher, evaluator: evaluator,
		permissions: permissions,
	}
}

// requirePermission is a no-op when no PermissionChecker is configured — the
// same convention the Node services use when a downstream service secret is
// unset (local dev without the full RBAC stack).
func (s *RulesServer) requirePermission(ctx context.Context, principal auth.Principal, permission rbacv1.Permission) error {
	if s.permissions == nil {
		return nil
	}
	allowed, err := s.permissions.HasPermission(ctx, principal.OrgID, principal.Roles, permission)
	if err != nil {
		return status.Error(codes.Internal, "permission check failed")
	}
	if !allowed {
		return status.Errorf(codes.PermissionDenied, "permission denied: %s", permission)
	}
	return nil
}

func orgIDFromCtx(ctx context.Context) (string, error) {
	principal, err := principalFromCtx(ctx)
	if err != nil {
		return "", err
	}
	return principal.OrgID, nil
}

func principalFromCtx(ctx context.Context) (auth.Principal, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return auth.Principal{}, status.Error(codes.Unauthenticated, "missing authenticated request context")
	}
	return principal, nil
}

func (s *RulesServer) UpsertRule(ctx context.Context, req *marginpb.UpsertRuleRequest) (*marginpb.UpsertRuleResponse, error) {
	principal, err := principalFromCtx(ctx)
	if err != nil {
		return nil, err
	}
	orgID := principal.OrgID
	if principal.UserID == "" {
		return nil, status.Error(codes.Unauthenticated, "authenticated user identity required")
	}
	if err := s.requirePermission(ctx, principal, rbacv1.Permission_PERMISSION_MARGIN_GUARDRAIL_MANAGE); err != nil {
		return nil, err
	}
	r := req.GetRule()
	if r == nil {
		return nil, status.Error(codes.InvalidArgument, "rule is required")
	}
	if r.FloorType == marginpb.FloorType_FLOOR_TYPE_UNSPECIFIED {
		return nil, status.Error(codes.InvalidArgument, "floor_type is required")
	}
	if r.FloorValue <= 0 {
		return nil, status.Error(codes.InvalidArgument, "floor_value must be positive")
	}
	if r.Currency == "" {
		return nil, status.Error(codes.InvalidArgument, "currency is required")
	}

	effectiveAt := time.Now()
	if r.EffectiveAt != nil {
		effectiveAt = r.EffectiveAt.AsTime()
	}

	p := repo.UpsertRuleParams{
		ID:          r.Id,
		OrgID:       orgID,
		FloorType:   floorTypeString(r.FloorType),
		FloorValue:  r.FloorValue,
		Currency:    r.Currency,
		EffectiveAt: effectiveAt,
		CreatedBy:   principal.UserID,
	}
	if r.ChannelId != "" {
		p.ChannelID = &r.ChannelId
	}
	if r.CategoryId != "" {
		p.CategoryID = &r.CategoryId
	}
	if r.SkuId != "" {
		p.SkuID = &r.SkuId
	}
	if r.EffectiveUntil != nil {
		t := r.EffectiveUntil.AsTime()
		p.EffectiveUntil = &t
	}

	var row *repo.MarginRuleRow
	if err := s.db.WithOrgTx(ctx, orgID, func(tx pgx.Tx) error {
		var txErr error
		row, txErr = s.repo.UpsertRule(ctx, tx, p)
		return txErr
	}); err != nil {
		s.logger.ErrorContext(ctx, "upsert rule", "error", err, "org_id", orgID)
		return nil, status.Error(codes.Internal, "internal error")
	}

	return &marginpb.UpsertRuleResponse{Rule: ruleToProto(row)}, nil
}

func (s *RulesServer) DeactivateRule(ctx context.Context, req *marginpb.DeactivateRuleRequest) (*marginpb.DeactivateRuleResponse, error) {
	principal, err := principalFromCtx(ctx)
	if err != nil {
		return nil, err
	}
	orgID := principal.OrgID
	if err := s.requirePermission(ctx, principal, rbacv1.Permission_PERMISSION_MARGIN_GUARDRAIL_MANAGE); err != nil {
		return nil, err
	}
	if req.Id == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}

	var row *repo.MarginRuleRow
	if err := s.db.WithOrgTx(ctx, orgID, func(tx pgx.Tx) error {
		var txErr error
		row, txErr = s.repo.DeactivateRule(ctx, tx, req.Id)
		return txErr
	}); err != nil {
		s.logger.ErrorContext(ctx, "deactivate rule", "error", err, "org_id", orgID, "rule_id", req.Id)
		return nil, status.Error(codes.Internal, "internal error")
	}
	if row == nil {
		return nil, status.Error(codes.NotFound, "rule not found")
	}

	return &marginpb.DeactivateRuleResponse{Rule: ruleToProto(row)}, nil
}

func (s *RulesServer) ListRules(ctx context.Context, req *marginpb.ListRulesRequest) (*marginpb.ListRulesResponse, error) {
	principal, err := principalFromCtx(ctx)
	if err != nil {
		return nil, err
	}
	orgID := principal.OrgID
	if err := s.requirePermission(ctx, principal, rbacv1.Permission_PERMISSION_MARGIN_GUARDRAIL_READ); err != nil {
		return nil, err
	}

	p := repo.ListRulesParams{
		PageSize: int(req.GetPagination().GetPageSize()),
	}
	if req.ChannelId != "" {
		p.ChannelID = &req.ChannelId
	}
	if req.CategoryId != "" {
		p.CategoryID = &req.CategoryId
	}
	if req.SkuId != "" {
		p.SkuID = &req.SkuId
	}

	var rows []*repo.MarginRuleRow
	if err := s.db.WithOrgTx(ctx, orgID, func(tx pgx.Tx) error {
		var txErr error
		rows, txErr = s.repo.ListRules(ctx, tx, p)
		return txErr
	}); err != nil {
		s.logger.ErrorContext(ctx, "list rules", "error", err, "org_id", orgID)
		return nil, status.Error(codes.Internal, "internal error")
	}

	resp := &marginpb.ListRulesResponse{}
	for _, r := range rows {
		resp.Rules = append(resp.Rules, ruleToProto(r))
	}
	return resp, nil
}

func floorTypeString(ft marginpb.FloorType) string {
	switch ft {
	case marginpb.FloorType_FLOOR_TYPE_PCT_MARGIN:
		return "pct_margin"
	case marginpb.FloorType_FLOOR_TYPE_PCT_MARKUP:
		return "pct_markup"
	case marginpb.FloorType_FLOOR_TYPE_ABSOLUTE_MINIMUM:
		return "absolute_minimum"
	default:
		return ""
	}
}

func ruleToProto(r *repo.MarginRuleRow) *marginpb.MarginRule {
	rule := &marginpb.MarginRule{
		Id:          r.ID,
		OrgId:       r.OrgID,
		FloorValue:  r.FloorValue,
		Currency:    r.Currency,
		CreatedBy:   r.CreatedBy,
		Version:     r.Version,
		EffectiveAt: timestamppb.New(r.EffectiveAt),
	}
	if r.ChannelID != nil {
		rule.ChannelId = *r.ChannelID
	}
	if r.CategoryID != nil {
		rule.CategoryId = *r.CategoryID
	}
	if r.SkuID != nil {
		rule.SkuId = *r.SkuID
	}
	if r.EffectiveUntil != nil {
		rule.EffectiveUntil = timestamppb.New(*r.EffectiveUntil)
	}
	switch r.FloorType {
	case "pct_margin":
		rule.FloorType = marginpb.FloorType_FLOOR_TYPE_PCT_MARGIN
	case "pct_markup":
		rule.FloorType = marginpb.FloorType_FLOOR_TYPE_PCT_MARKUP
	case "absolute_minimum":
		rule.FloorType = marginpb.FloorType_FLOOR_TYPE_ABSOLUTE_MINIMUM
	}
	return rule
}
