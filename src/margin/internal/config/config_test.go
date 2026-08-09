package config

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLoadDevelopmentDefaults(t *testing.T) {
	setRequiredDatabase(t)
	cfg, err := Load()
	require.NoError(t, err)
	require.Equal(t, "catalog:50052", cfg.CatalogAddr)
	require.Equal(t, "data-pipeline:50055", cfg.IntelligenceAddr)
	require.Len(t, cfg.ServiceSecrets, 2)
	require.Equal(t, devGatewaySecret, cfg.ServiceSecrets["gateway_svc"])
	require.Equal(t, devProposalSecret, cfg.ServiceSecrets["proposal_svc"])
}

func TestLoadProductionRequiresExplicitSecrets(t *testing.T) {
	setRequiredDatabase(t)
	t.Setenv("ENVIRONMENT", "production")
	_, err := Load()
	require.ErrorContains(t, err, "MARGIN_SERVICE_SECRETS_JSON is required")
}

func TestLoadProductionRejectsDevelopmentSecrets(t *testing.T) {
	setRequiredDatabase(t)
	t.Setenv("ENVIRONMENT", "production")
	t.Setenv("MARGIN_SERVICE_SECRETS_JSON", `{"gateway_svc":"dev-only-margin-gateway-secret-change-me","proposal_svc":"test-margin-proposal-production-secret"}`)
	t.Setenv("MARGIN_CATALOG_SERVICE_SECRET", "test-catalog-margin-production-secret")
	t.Setenv("MARGIN_INTELLIGENCE_SERVICE_SECRET", "test-intelligence-margin-production-secret")
	_, err := Load()
	require.ErrorContains(t, err, "production cannot use")
}

func TestLoadRejectsMalformedSettings(t *testing.T) {
	setRequiredDatabase(t)
	tests := []struct {
		name  string
		key   string
		value string
	}{
		{name: "timeout", key: "CATALOG_TIMEOUT_SEC", value: "zero"},
		{name: "monitor flag", key: "BREACH_MONITOR_ENABLED", value: "sometimes"},
		{name: "empty brokers", key: "KAFKA_BROKERS", value: ", ,"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv(test.key, test.value)
			_, err := Load()
			require.Error(t, err)
		})
	}
}

func TestLoadRejectsMissingDatabase(t *testing.T) {
	t.Setenv("MARGIN_DATABASE_URL", "")
	t.Setenv("DATABASE_URL", "")
	_, err := Load()
	require.ErrorContains(t, err, "DATABASE_URL")
}

func setRequiredDatabase(t *testing.T) {
	t.Helper()
	t.Setenv("MARGIN_DATABASE_URL", "postgresql://margin_svc:password@localhost:5432/owomide")
	t.Setenv("DATABASE_URL", "")
}
