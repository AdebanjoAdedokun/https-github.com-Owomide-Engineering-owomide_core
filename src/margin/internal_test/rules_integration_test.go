package integration_test

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ory/dockertest/v3"
	"github.com/ory/dockertest/v3/docker"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"

	"github.com/owomide/margin/internal/auth"
	"github.com/owomide/margin/internal/db"
	"github.com/owomide/margin/internal/handler"
	"github.com/owomide/margin/internal/repo"
	marginpb "github.com/owomide/proto/services/margin/v1"
)

const (
	orgA              = "00000000-0000-0000-0000-000000000001"
	orgB              = "00000000-0000-0000-0000-000000000002"
	testServiceSecret = "test-margin-gateway-secret-change-me"
	testIssuer        = "owomide-internal"
)

var (
	testClient marginpb.MarginServiceClient
	sharedDB   *db.DB
	sharedRepo *repo.Repo
)

func TestMain(m *testing.M) {
	pool, err := dockertest.NewPool("")
	if err != nil {
		panic("connect docker: " + err.Error())
	}

	resource, err := pool.RunWithOptions(&dockertest.RunOptions{
		Repository: "postgres",
		Tag:        "16-alpine",
		Env: []string{
			"POSTGRES_DB=margin_test",
			"POSTGRES_USER=postgres",
			"POSTGRES_PASSWORD=postgres",
		},
	}, func(hc *docker.HostConfig) {
		hc.AutoRemove = true
		hc.RestartPolicy = docker.RestartPolicy{Name: "no"}
	})
	if err != nil {
		panic("start postgres: " + err.Error())
	}
	_ = resource.Expire(120)

	connStr := fmt.Sprintf(
		"host=localhost port=%s user=postgres password=postgres dbname=margin_test sslmode=disable",
		resource.GetPort("5432/tcp"),
	)

	var superPool *pgxpool.Pool
	if err := pool.Retry(func() error {
		var e error
		superPool, e = pgxpool.New(context.Background(), connStr)
		if e != nil {
			return e
		}
		return superPool.Ping(context.Background())
	}); err != nil {
		panic("wait postgres: " + err.Error())
	}

	if err := applyMigrations(context.Background(), superPool); err != nil {
		panic("migrations: " + err.Error())
	}
	superPool.Close()

	svcConnStr := strings.Replace(connStr, "user=postgres password=postgres", "user=margin_svc password=test-password", 1)
	var dbErr error
	sharedDB, dbErr = db.New(svcConnStr)
	if dbErr != nil {
		panic("service pool: " + dbErr.Error())
	}
	defer sharedDB.Close()

	sharedRepo = repo.New()
	svc := handler.NewRulesServer(
		sharedDB,
		sharedRepo,
		slog.Default(),
		&stubCostFetcher{},
		&stubMarginEvaluator{},
		nil,
	)

	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		panic("listen: " + err.Error())
	}
	authenticator, err := newTestAuthenticator()
	if err != nil {
		panic("authenticator: " + err.Error())
	}
	s := grpc.NewServer(grpc.UnaryInterceptor(authenticator.UnaryServerInterceptor()))
	marginpb.RegisterMarginServiceServer(s, svc)
	go func() { _ = s.Serve(lis) }()
	defer s.Stop()

	conn, err := grpc.NewClient(lis.Addr().String(),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		panic("grpc dial: " + err.Error())
	}
	defer func() { _ = conn.Close() }()
	testClient = marginpb.NewMarginServiceClient(conn)

	code := m.Run()
	_ = pool.Purge(resource)
	os.Exit(code)
}

func newTestAuthenticator() (*auth.Authenticator, error) {
	return auth.NewAuthenticator(
		testIssuer,
		"margin",
		map[string]string{"gateway_svc": testServiceSecret},
		map[string][]string{
			marginpb.MarginService_ValidateBatch_FullMethodName:  {"gateway_svc"},
			marginpb.MarginService_ListRules_FullMethodName:      {"gateway_svc"},
			marginpb.MarginService_UpsertRule_FullMethodName:     {"gateway_svc"},
			marginpb.MarginService_DeactivateRule_FullMethodName: {"gateway_svc"},
		},
	)
}

func applyMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	setup := []string{
		"CREATE SCHEMA IF NOT EXISTS margin",
		"CREATE ROLE margin_svc LOGIN PASSWORD 'test-password' NOINHERIT",
		"GRANT USAGE ON SCHEMA margin TO margin_svc",
	}
	for _, s := range setup {
		if _, err := pool.Exec(ctx, s); err != nil && !strings.Contains(err.Error(), "already exists") {
			return fmt.Errorf("setup %q: %w", s, err)
		}
	}

	files := []string{
		"../migrations/0001_create_schema.up.sql",
		"../migrations/0002_margin_rule.up.sql",
		"../migrations/0003_breach_monitor_helpers.up.sql",
	}
	for _, f := range files {
		data, err := os.ReadFile(f)
		if err != nil {
			return fmt.Errorf("read %s: %w", f, err)
		}
		if _, err := pool.Exec(ctx, string(data)); err != nil {
			return fmt.Errorf("apply %s: %w", f, err)
		}
	}
	return nil
}

func ctxOrg(orgID string) context.Context {
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
		"x-user-id", "00000000-0000-0000-0000-000000000011",
		"x-user-roles", "admin",
	)
	return metadata.NewOutgoingContext(context.Background(), md)
}

func TestUpsertRule_Create(t *testing.T) {
	ctx := ctxOrg(orgA)
	resp, err := testClient.UpsertRule(ctx, &marginpb.UpsertRuleRequest{
		Rule: &marginpb.MarginRule{
			FloorType:  marginpb.FloorType_FLOOR_TYPE_PCT_MARGIN,
			FloorValue: 2000,
			Currency:   "NGN",
			CreatedBy:  "00000000-0000-0000-0000-000000000011",
		},
	})
	if err != nil {
		t.Fatalf("UpsertRule: %v", err)
	}
	if resp.Rule.Id == "" {
		t.Fatal("expected non-empty rule id")
	}
	if resp.Rule.OrgId != orgA {
		t.Errorf("org_id = %q, want %q", resp.Rule.OrgId, orgA)
	}
	if resp.Rule.Version != 1 {
		t.Errorf("version = %d, want 1", resp.Rule.Version)
	}
}

func TestUpsertRule_Update_IncrementsVersion(t *testing.T) {
	ctx := ctxOrg(orgA)
	created, err := testClient.UpsertRule(ctx, &marginpb.UpsertRuleRequest{
		Rule: &marginpb.MarginRule{
			FloorType:  marginpb.FloorType_FLOOR_TYPE_ABSOLUTE_MINIMUM,
			FloorValue: 100000,
			Currency:   "NGN",
			CreatedBy:  "00000000-0000-0000-0000-000000000011",
		},
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	updated, err := testClient.UpsertRule(ctx, &marginpb.UpsertRuleRequest{
		Rule: &marginpb.MarginRule{
			Id:         created.Rule.Id,
			FloorType:  marginpb.FloorType_FLOOR_TYPE_ABSOLUTE_MINIMUM,
			FloorValue: 120000,
			Currency:   "NGN",
			CreatedBy:  "00000000-0000-0000-0000-000000000011",
		},
	})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Rule.Version != 2 {
		t.Errorf("version after update = %d, want 2", updated.Rule.Version)
	}
	if updated.Rule.FloorValue != 120000 {
		t.Errorf("floor_value = %d, want 120000", updated.Rule.FloorValue)
	}
}

func TestDeactivateRule_NotReturnedByListRules(t *testing.T) {
	ctx := ctxOrg(orgA)
	created, err := testClient.UpsertRule(ctx, &marginpb.UpsertRuleRequest{
		Rule: &marginpb.MarginRule{
			FloorType:  marginpb.FloorType_FLOOR_TYPE_PCT_MARKUP,
			FloorValue: 1500,
			Currency:   "NGN",
			CreatedBy:  "00000000-0000-0000-0000-000000000011",
		},
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	ruleID := created.Rule.Id

	if _, err = testClient.DeactivateRule(ctx, &marginpb.DeactivateRuleRequest{Id: ruleID}); err != nil {
		t.Fatalf("deactivate: %v", err)
	}

	list, err := testClient.ListRules(ctx, &marginpb.ListRulesRequest{})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	for _, r := range list.Rules {
		if r.Id == ruleID {
			t.Error("deactivated rule still returned by ListRules")
		}
	}
}

func TestListRules_FilterByChannelID(t *testing.T) {
	ctx := ctxOrg(orgA)
	channelID := "00000000-0000-0000-0000-000000000099"

	if _, err := testClient.UpsertRule(ctx, &marginpb.UpsertRuleRequest{
		Rule: &marginpb.MarginRule{
			ChannelId:  channelID,
			FloorType:  marginpb.FloorType_FLOOR_TYPE_PCT_MARGIN,
			FloorValue: 1000,
			Currency:   "NGN",
			CreatedBy:  "00000000-0000-0000-0000-000000000011",
		},
	}); err != nil {
		t.Fatalf("create channel-scoped rule: %v", err)
	}

	list, err := testClient.ListRules(ctx, &marginpb.ListRulesRequest{ChannelId: channelID})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list.Rules) == 0 {
		t.Fatal("expected at least 1 rule for channel")
	}
	for _, r := range list.Rules {
		if r.ChannelId != channelID {
			t.Errorf("rule %s has channel_id %q, want %q", r.Id, r.ChannelId, channelID)
		}
	}
}

func TestRLSIsolation_OrgBCannotSeeOrgARule(t *testing.T) {
	ctxA := ctxOrg(orgA)
	created, err := testClient.UpsertRule(ctxA, &marginpb.UpsertRuleRequest{
		Rule: &marginpb.MarginRule{
			FloorType:  marginpb.FloorType_FLOOR_TYPE_PCT_MARGIN,
			FloorValue: 3000,
			Currency:   "NGN",
			CreatedBy:  "00000000-0000-0000-0000-000000000011",
		},
	})
	if err != nil {
		t.Fatalf("create ORG_A rule: %v", err)
	}
	ruleID := created.Rule.Id

	ctxB := ctxOrg(orgB)
	list, err := testClient.ListRules(ctxB, &marginpb.ListRulesRequest{})
	if err != nil {
		t.Fatalf("list ORG_B: %v", err)
	}
	for _, r := range list.Rules {
		if r.Id == ruleID {
			t.Errorf("ORG_B can see ORG_A rule %s — RLS not working", ruleID)
		}
	}
}
