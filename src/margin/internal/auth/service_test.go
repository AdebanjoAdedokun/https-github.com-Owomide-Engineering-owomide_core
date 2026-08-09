package auth

import (
	"context"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

const (
	testIssuer         = "owomide-internal"
	testGatewaySecret  = "test-margin-gateway-secret-change-me"
	testProposalSecret = "test-margin-proposal-secret-change-me"
	validateMethod     = "/owomide.services.margin.v1.MarginService/ValidateBatch"
	upsertMethod       = "/owomide.services.margin.v1.MarginService/UpsertRule"
)

func TestAuthenticatorAcceptsSignedCallerAndInjectsPrincipal(t *testing.T) {
	now := time.Date(2026, 8, 9, 12, 0, 0, 0, time.UTC)
	authenticator := testAuthenticator(t, now)
	token := signedToken(t, "gateway_svc", "margin", testGatewaySecret, now)
	ctx := incomingContext(
		"authorization", "Bearer "+token,
		"x-org-id", "org-1",
		"x-user-id", "user-1",
		"x-user-roles", "admin, analyst",
	)

	response, err := authenticator.UnaryServerInterceptor()(
		ctx,
		"request",
		&grpc.UnaryServerInfo{FullMethod: upsertMethod},
		func(ctx context.Context, request any) (any, error) {
			principal, ok := PrincipalFromContext(ctx)
			require.True(t, ok)
			require.Equal(t, Principal{
				ServiceID: "gateway_svc",
				OrgID:     "org-1",
				UserID:    "user-1",
				Roles:     []string{"admin", "analyst"},
			}, principal)
			return request, nil
		},
	)
	require.NoError(t, err)
	require.Equal(t, "request", response)
}

func TestAuthenticatorEnforcesMethodPolicy(t *testing.T) {
	now := time.Date(2026, 8, 9, 12, 0, 0, 0, time.UTC)
	authenticator := testAuthenticator(t, now)
	token := signedToken(t, "proposal_svc", "margin", testProposalSecret, now)
	ctx := incomingContext("authorization", "Bearer "+token, "x-org-id", "org-1")

	_, err := authenticator.UnaryServerInterceptor()(
		ctx,
		nil,
		&grpc.UnaryServerInfo{FullMethod: upsertMethod},
		func(context.Context, any) (any, error) { return nil, nil },
	)
	require.Equal(t, codes.PermissionDenied, status.Code(err))

	_, err = authenticator.UnaryServerInterceptor()(
		ctx,
		nil,
		&grpc.UnaryServerInfo{FullMethod: validateMethod},
		func(context.Context, any) (any, error) { return nil, nil },
	)
	require.NoError(t, err)
}

func TestAuthenticatorRejectsInvalidCredentialsAndTenantContext(t *testing.T) {
	now := time.Date(2026, 8, 9, 12, 0, 0, 0, time.UTC)
	authenticator := testAuthenticator(t, now)
	valid := signedToken(t, "gateway_svc", "margin", testGatewaySecret, now)

	tests := []struct {
		name string
		ctx  context.Context
	}{
		{name: "missing credential", ctx: incomingContext("x-org-id", "org-1")},
		{name: "wrong audience", ctx: incomingContext(
			"authorization", "Bearer "+signedToken(t, "gateway_svc", "catalog", testGatewaySecret, now),
			"x-org-id", "org-1",
		)},
		{name: "wrong secret", ctx: incomingContext(
			"authorization", "Bearer "+signedToken(t, "gateway_svc", "margin", "different-margin-gateway-secret-value", now),
			"x-org-id", "org-1",
		)},
		{name: "expired", ctx: incomingContext(
			"authorization", "Bearer "+signedToken(t, "gateway_svc", "margin", testGatewaySecret, now.Add(-10*time.Minute)),
			"x-org-id", "org-1",
		)},
		{name: "expiry before issue time", ctx: incomingContext(
			"authorization", "Bearer "+signedTokenWithTimes(t, now, now.Add(-time.Second)),
			"x-org-id", "org-1",
		)},
		{name: "missing org", ctx: incomingContext("authorization", "Bearer "+valid)},
		{name: "duplicate org", ctx: incomingContext(
			"authorization", "Bearer "+valid,
			"x-org-id", "org-1",
			"x-org-id", "org-2",
		)},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := authenticator.UnaryServerInterceptor()(
				test.ctx,
				nil,
				&grpc.UnaryServerInfo{FullMethod: upsertMethod},
				func(context.Context, any) (any, error) { return nil, nil },
			)
			require.Equal(t, codes.Unauthenticated, status.Code(err))
		})
	}
}

func signedTokenWithTimes(t *testing.T, issuedAt, expiresAt time.Time) string {
	t.Helper()
	claims := jwt.MapClaims{
		"iss": testIssuer,
		"sub": "gateway_svc",
		"aud": "margin",
		"iat": issuedAt.Unix(),
		"exp": expiresAt.Unix(),
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testGatewaySecret))
	require.NoError(t, err)
	return token
}

func TestNewAuthenticatorRejectsPermissionWithoutSecret(t *testing.T) {
	_, err := NewAuthenticator(
		testIssuer,
		"margin",
		map[string]string{"gateway_svc": testGatewaySecret},
		map[string][]string{validateMethod: {"proposal_svc"}},
	)
	require.ErrorContains(t, err, "without a secret")
}

func testAuthenticator(t *testing.T, now time.Time) *Authenticator {
	t.Helper()
	authenticator, err := NewAuthenticator(
		testIssuer,
		"margin",
		map[string]string{
			"gateway_svc":  testGatewaySecret,
			"proposal_svc": testProposalSecret,
		},
		map[string][]string{
			validateMethod: {"gateway_svc", "proposal_svc"},
			upsertMethod:   {"gateway_svc"},
		},
	)
	require.NoError(t, err)
	authenticator.now = func() time.Time { return now }
	return authenticator
}

func signedToken(t *testing.T, subject, audience, secret string, now time.Time) string {
	t.Helper()
	signer, err := NewSigner(subject, testIssuer, secret)
	require.NoError(t, err)
	token, err := signer.Token(audience, now)
	require.NoError(t, err)
	return token
}

func incomingContext(values ...string) context.Context {
	return metadata.NewIncomingContext(context.Background(), metadata.Pairs(values...))
}
