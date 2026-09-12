package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
)

const (
	devGatewaySecret      = "dev-only-margin-gateway-secret-change-me"
	devProposalSecret     = "dev-only-margin-proposal-secret-change-me"
	devCatalogSecret      = "dev-only-catalog-margin-secret-change-me"
	devIntelligenceSecret = "dev-only-data-pipeline-margin-secret-change-me"
	devRbacSecret         = "dev-only-rbac-margin-secret-change-me"
)

type Config struct {
	Environment              string
	DatabaseURL              string
	Host                     string
	Port                     string
	HealthHost               string
	HealthPort               string
	CatalogAddr              string
	CatalogSecret            string
	CatalogTimeoutSec        int
	IntelligenceAddr         string
	IntelligenceSecret       string
	IntelligenceTimeoutSec   int
	RbacAddr                 string
	RbacSecret               string
	RbacTimeoutSec           int
	ServiceJWTIssuer         string
	ServiceSecrets           map[string]string
	KafkaBrokers             []string
	BreachMonitorEnabled     bool
	BreachMonitorIntervalSec int
	BreachMonitorBatchSize   int
}

func Load() (Config, error) {
	environment := envOr("ENVIRONMENT", "development")
	databaseURL := firstNonEmpty(os.Getenv("MARGIN_DATABASE_URL"), os.Getenv("DATABASE_URL"))
	serviceSecretsRaw := os.Getenv("MARGIN_SERVICE_SECRETS_JSON")
	catalogSecret := os.Getenv("MARGIN_CATALOG_SERVICE_SECRET")
	intelligenceSecret := os.Getenv("MARGIN_INTELLIGENCE_SERVICE_SECRET")
	rbacSecret := os.Getenv("MARGIN_RBAC_SERVICE_SECRET")
	if environment == "development" || environment == "test" {
		if serviceSecretsRaw == "" {
			serviceSecretsRaw = fmt.Sprintf(
				`{"gateway_svc":%q,"proposal_svc":%q}`,
				devGatewaySecret,
				devProposalSecret,
			)
		}
		if catalogSecret == "" {
			catalogSecret = devCatalogSecret
		}
		if intelligenceSecret == "" {
			intelligenceSecret = devIntelligenceSecret
		}
		if rbacSecret == "" {
			rbacSecret = devRbacSecret
		}
	}

	serviceSecrets, err := parseServiceSecrets(serviceSecretsRaw)
	if err != nil {
		return Config{}, err
	}
	catalogTimeoutSec, err := integerEnv("CATALOG_TIMEOUT_SEC", 5, 1, 30)
	if err != nil {
		return Config{}, err
	}
	intelligenceTimeoutSec, err := integerEnv("INTELLIGENCE_TIMEOUT_SEC", 5, 1, 30)
	if err != nil {
		return Config{}, err
	}
	rbacTimeoutSec, err := integerEnv("RBAC_TIMEOUT_SEC", 5, 1, 30)
	if err != nil {
		return Config{}, err
	}
	monitorEnabled, err := boolEnv("BREACH_MONITOR_ENABLED", true)
	if err != nil {
		return Config{}, err
	}
	monitorIntervalSec, err := integerEnv("BREACH_MONITOR_INTERVAL_SEC", 300, 1, 86_400)
	if err != nil {
		return Config{}, err
	}
	monitorBatchSize, err := integerEnv("BREACH_MONITOR_BATCH_SIZE", 100, 1, 10_000)
	if err != nil {
		return Config{}, err
	}
	brokers, err := commaSeparatedEnv("KAFKA_BROKERS", []string{"localhost:9092"})
	if err != nil {
		return Config{}, err
	}
	cfg := Config{
		Environment:              environment,
		DatabaseURL:              databaseURL,
		Host:                     envOr("HOST", "0.0.0.0"),
		Port:                     envOr("PORT", "50053"),
		HealthHost:               envOr("HEALTH_HOST", "0.0.0.0"),
		HealthPort:               envOr("HEALTH_PORT", "8080"),
		CatalogAddr:              envOr("CATALOG_ADDR", "catalog:50052"),
		CatalogSecret:            catalogSecret,
		CatalogTimeoutSec:        catalogTimeoutSec,
		IntelligenceAddr:         envOr("INTELLIGENCE_ADDR", "data-pipeline:50055"),
		IntelligenceSecret:       intelligenceSecret,
		IntelligenceTimeoutSec:   intelligenceTimeoutSec,
		RbacAddr:                 envOr("RBAC_ADDR", "rbac:50056"),
		RbacSecret:               rbacSecret,
		RbacTimeoutSec:           rbacTimeoutSec,
		ServiceJWTIssuer:         firstNonEmpty(os.Getenv("MARGIN_SERVICE_JWT_ISSUER"), envOr("SERVICE_JWT_ISSUER", "owomide-internal")),
		ServiceSecrets:           serviceSecrets,
		KafkaBrokers:             brokers,
		BreachMonitorEnabled:     monitorEnabled,
		BreachMonitorIntervalSec: monitorIntervalSec,
		BreachMonitorBatchSize:   monitorBatchSize,
	}
	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func (c Config) Validate() error {
	if c.Environment != "development" && c.Environment != "test" && c.Environment != "staging" && c.Environment != "production" {
		return fmt.Errorf("ENVIRONMENT must be development, test, staging, or production")
	}
	if strings.TrimSpace(c.DatabaseURL) == "" {
		return errors.New("MARGIN_DATABASE_URL or DATABASE_URL is required")
	}
	parsedURL, err := url.Parse(c.DatabaseURL)
	if err != nil || (parsedURL.Scheme != "postgres" && parsedURL.Scheme != "postgresql") || parsedURL.Host == "" {
		return errors.New("MARGIN_DATABASE_URL or DATABASE_URL must be a valid PostgreSQL URL")
	}
	for name, value := range map[string]string{
		"HOST":              c.Host,
		"PORT":              c.Port,
		"HEALTH_HOST":       c.HealthHost,
		"HEALTH_PORT":       c.HealthPort,
		"CATALOG_ADDR":      c.CatalogAddr,
		"INTELLIGENCE_ADDR": c.IntelligenceAddr,
		"RBAC_ADDR":         c.RbacAddr,
	} {
		if strings.TrimSpace(value) == "" {
			return fmt.Errorf("%s is required", name)
		}
	}
	if err := validatePort("PORT", c.Port); err != nil {
		return err
	}
	if err := validatePort("HEALTH_PORT", c.HealthPort); err != nil {
		return err
	}
	if _, _, err := net.SplitHostPort(c.CatalogAddr); err != nil {
		return fmt.Errorf("CATALOG_ADDR must be host:port: %w", err)
	}
	if _, _, err := net.SplitHostPort(c.IntelligenceAddr); err != nil {
		return fmt.Errorf("INTELLIGENCE_ADDR must be host:port: %w", err)
	}
	if _, _, err := net.SplitHostPort(c.RbacAddr); err != nil {
		return fmt.Errorf("RBAC_ADDR must be host:port: %w", err)
	}
	if strings.TrimSpace(c.ServiceJWTIssuer) == "" {
		return errors.New("MARGIN_SERVICE_JWT_ISSUER is required")
	}
	if len(c.CatalogSecret) < 32 {
		return errors.New("MARGIN_CATALOG_SERVICE_SECRET must be at least 32 characters")
	}
	if len(c.IntelligenceSecret) < 32 {
		return errors.New("MARGIN_INTELLIGENCE_SERVICE_SECRET must be at least 32 characters")
	}
	if len(c.RbacSecret) < 32 {
		return errors.New("MARGIN_RBAC_SERVICE_SECRET must be at least 32 characters")
	}
	for _, caller := range []string{"gateway_svc", "proposal_svc"} {
		if len(c.ServiceSecrets[caller]) < 32 {
			return fmt.Errorf("MARGIN_SERVICE_SECRETS_JSON must contain a secret of at least 32 characters for %s", caller)
		}
	}
	if c.Environment == "staging" || c.Environment == "production" {
		for name, secret := range map[string]string{
			"gateway_svc":  c.ServiceSecrets["gateway_svc"],
			"proposal_svc": c.ServiceSecrets["proposal_svc"],
			"catalog":      c.CatalogSecret,
			"intelligence": c.IntelligenceSecret,
			"rbac":         c.RbacSecret,
		} {
			if strings.HasPrefix(secret, "dev-only-") {
				return fmt.Errorf("%s cannot use the development secret for %s", c.Environment, name)
			}
		}
	}
	if len(c.KafkaBrokers) == 0 {
		return errors.New("KAFKA_BROKERS must contain at least one broker")
	}
	return nil
}

func parseServiceSecrets(raw string) (map[string]string, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, errors.New("MARGIN_SERVICE_SECRETS_JSON is required")
	}
	var secrets map[string]string
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&secrets); err != nil {
		return nil, fmt.Errorf("MARGIN_SERVICE_SECRETS_JSON must be a JSON object of service secrets: %w", err)
	}
	if secrets == nil {
		return nil, errors.New("MARGIN_SERVICE_SECRETS_JSON must be a JSON object")
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return nil, errors.New("MARGIN_SERVICE_SECRETS_JSON must contain exactly one JSON object")
	}
	return secrets, nil
}

func integerEnv(name string, fallback, minimum, maximum int) (int, error) {
	raw := os.Getenv(name)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < minimum || value > maximum {
		return 0, fmt.Errorf("%s must be an integer between %d and %d", name, minimum, maximum)
	}
	return value, nil
}

func boolEnv(name string, fallback bool) (bool, error) {
	raw := os.Getenv(name)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.ParseBool(raw)
	if err != nil {
		return false, fmt.Errorf("%s must be true or false", name)
	}
	return value, nil
}

func commaSeparatedEnv(name string, fallback []string) ([]string, error) {
	raw := os.Getenv(name)
	if raw == "" {
		return fallback, nil
	}
	values := make([]string, 0)
	for _, value := range strings.Split(raw, ",") {
		if value = strings.TrimSpace(value); value != "" {
			values = append(values, value)
		}
	}
	if len(values) == 0 {
		return nil, fmt.Errorf("%s must contain at least one value", name)
	}
	return values, nil
}

func validatePort(name, raw string) error {
	port, err := strconv.Atoi(raw)
	if err != nil || port < 1 || port > 65_535 {
		return fmt.Errorf("%s must be an integer between 1 and 65535", name)
	}
	return nil
}

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
