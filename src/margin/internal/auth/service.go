package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

const (
	defaultTokenLifetime = 2 * time.Minute
	maximumTokenAge      = 5 * time.Minute
	clockSkew            = 30 * time.Second
)

type principalKey struct{}

// Principal is trusted request identity established by the server interceptor.
type Principal struct {
	ServiceID string
	OrgID     string
	UserID    string
	Roles     []string
}

// PrincipalFromContext returns the authenticated service and tenant context.
func PrincipalFromContext(ctx context.Context) (Principal, bool) {
	principal, ok := ctx.Value(principalKey{}).(Principal)
	return principal, ok
}

// Signer creates short-lived service credentials for downstream RPCs.
type Signer struct {
	subject string
	issuer  string
	secret  []byte
}

func NewSigner(subject, issuer, secret string) (*Signer, error) {
	if strings.TrimSpace(subject) == "" {
		return nil, errors.New("service JWT subject is required")
	}
	if strings.TrimSpace(issuer) == "" {
		return nil, errors.New("service JWT issuer is required")
	}
	if len(secret) < 32 {
		return nil, errors.New("service JWT secret must be at least 32 characters")
	}
	return &Signer{subject: subject, issuer: issuer, secret: []byte(secret)}, nil
}

func (s *Signer) Token(audience string, now time.Time) (string, error) {
	if strings.TrimSpace(audience) == "" {
		return "", errors.New("service JWT audience is required")
	}
	now = now.UTC()
	claims := jwt.MapClaims{
		"iss": s.issuer,
		"sub": s.subject,
		"aud": audience,
		"iat": now.Unix(),
		"exp": now.Add(defaultTokenLifetime).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.secret)
}

// Authenticator validates service credentials and applies per-method caller policy.
type Authenticator struct {
	issuer      string
	audience    string
	secrets     map[string][]byte
	permissions map[string]map[string]struct{}
	now         func() time.Time
}

func NewAuthenticator(
	issuer string,
	audience string,
	secrets map[string]string,
	permissions map[string][]string,
) (*Authenticator, error) {
	if strings.TrimSpace(issuer) == "" {
		return nil, errors.New("service JWT issuer is required")
	}
	if strings.TrimSpace(audience) == "" {
		return nil, errors.New("service JWT audience is required")
	}
	parsedSecrets := make(map[string][]byte, len(secrets))
	for service, secret := range secrets {
		if strings.TrimSpace(service) == "" {
			return nil, errors.New("service secret has an empty service ID")
		}
		if len(secret) < 32 {
			return nil, fmt.Errorf("service secret for %s must be at least 32 characters", service)
		}
		parsedSecrets[service] = []byte(secret)
	}
	parsedPermissions := make(map[string]map[string]struct{}, len(permissions))
	for method, services := range permissions {
		if strings.TrimSpace(method) == "" || len(services) == 0 {
			return nil, errors.New("each RPC permission must have a method and at least one service")
		}
		allowed := make(map[string]struct{}, len(services))
		for _, service := range services {
			if _, ok := parsedSecrets[service]; !ok {
				return nil, fmt.Errorf("RPC permission for %s references service %s without a secret", method, service)
			}
			allowed[service] = struct{}{}
		}
		parsedPermissions[method] = allowed
	}
	return &Authenticator{
		issuer:      issuer,
		audience:    audience,
		secrets:     parsedSecrets,
		permissions: parsedPermissions,
		now:         time.Now,
	}, nil
}

func (a *Authenticator) UnaryServerInterceptor() grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req any,
		info *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (any, error) {
		principal, err := a.authenticate(ctx, info.FullMethod)
		if err != nil {
			return nil, err
		}
		return handler(context.WithValue(ctx, principalKey{}, principal), req)
	}
}

func (a *Authenticator) authenticate(ctx context.Context, method string) (Principal, error) {
	allowed, ok := a.permissions[method]
	if !ok {
		return Principal{}, status.Error(codes.PermissionDenied, "RPC method is not authorized")
	}
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return Principal{}, status.Error(codes.Unauthenticated, "missing service credential")
	}
	authorization, err := exactlyOne(md, "authorization", true)
	if err != nil || !strings.HasPrefix(authorization, "Bearer ") {
		return Principal{}, status.Error(codes.Unauthenticated, "missing service credential")
	}
	tokenString := strings.TrimSpace(strings.TrimPrefix(authorization, "Bearer "))
	if tokenString == "" {
		return Principal{}, status.Error(codes.Unauthenticated, "missing service credential")
	}

	claims := &jwt.RegisteredClaims{}
	parsed, err := jwt.ParseWithClaims(
		tokenString,
		claims,
		func(token *jwt.Token) (any, error) {
			secret, exists := a.secrets[claims.Subject]
			if !exists {
				return nil, errors.New("unknown service")
			}
			return secret, nil
		},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(a.issuer),
		jwt.WithAudience(a.audience),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
		jwt.WithLeeway(clockSkew),
		jwt.WithTimeFunc(a.now),
		jwt.WithStrictDecoding(),
	)
	if err != nil || !parsed.Valid || claims.IssuedAt == nil || claims.ExpiresAt == nil {
		return Principal{}, status.Error(codes.Unauthenticated, "invalid or expired service credential")
	}
	now := a.now().UTC()
	issuedAt := claims.IssuedAt.UTC()
	expiresAt := claims.ExpiresAt.UTC()
	if issuedAt.After(now.Add(clockSkew)) || now.Sub(issuedAt) > maximumTokenAge+clockSkew ||
		!expiresAt.After(issuedAt) || expiresAt.Sub(issuedAt) > maximumTokenAge {
		return Principal{}, status.Error(codes.Unauthenticated, "invalid or expired service credential")
	}
	if _, ok := allowed[claims.Subject]; !ok {
		return Principal{}, status.Error(codes.PermissionDenied, "caller is not authorized for this method")
	}

	orgID, err := exactlyOne(md, "x-org-id", true)
	if err != nil {
		return Principal{}, status.Error(codes.Unauthenticated, "missing authenticated organization context")
	}
	userID, err := exactlyOne(md, "x-user-id", false)
	if err != nil {
		return Principal{}, status.Error(codes.Unauthenticated, "invalid authenticated user context")
	}
	rolesHeader, err := exactlyOne(md, "x-user-roles", false)
	if err != nil {
		return Principal{}, status.Error(codes.Unauthenticated, "invalid authenticated role context")
	}
	roles := make([]string, 0)
	for _, role := range strings.Split(rolesHeader, ",") {
		if role = strings.TrimSpace(role); role != "" {
			roles = append(roles, role)
		}
	}
	return Principal{
		ServiceID: claims.Subject,
		OrgID:     orgID,
		UserID:    userID,
		Roles:     roles,
	}, nil
}

func exactlyOne(md metadata.MD, key string, required bool) (string, error) {
	values := md.Get(key)
	if len(values) == 0 && !required {
		return "", nil
	}
	if len(values) != 1 || strings.TrimSpace(values[0]) == "" {
		return "", fmt.Errorf("%s must have exactly one non-empty value", key)
	}
	return strings.TrimSpace(values[0]), nil
}
