package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	DatabaseURL              string
	Port                     string
	CatalogAddr              string
	IntelligenceAddr         string
	IntelligenceSecret       string
	ServiceJWTIssuer         string
	IntelligenceTimeoutSec   int
	KafkaBrokers             []string
	BreachMonitorEnabled     bool
	BreachMonitorIntervalSec int
	BreachMonitorBatchSize   int
}

func Load() Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "50053"
	}
	catalogAddr := os.Getenv("CATALOG_ADDR")
	if catalogAddr == "" {
		catalogAddr = "catalog-svc:50052"
	}
	intelligenceAddr := os.Getenv("INTELLIGENCE_ADDR")
	if intelligenceAddr == "" {
		intelligenceAddr = "data-pipeline:50055"
	}
	intelligenceSecret := os.Getenv("MARGIN_INTELLIGENCE_SERVICE_SECRET")
	if intelligenceSecret == "" {
		intelligenceSecret = "dev-only-data-pipeline-margin-secret-change-me"
	}
	serviceJWTIssuer := os.Getenv("SERVICE_JWT_ISSUER")
	if serviceJWTIssuer == "" {
		serviceJWTIssuer = "owomide-internal"
	}
	intelligenceTimeoutSec := 5
	if v := os.Getenv("INTELLIGENCE_TIMEOUT_SEC"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 30 {
			intelligenceTimeoutSec = n
		}
	}

	brokers := []string{"localhost:9092"}
	if raw := os.Getenv("KAFKA_BROKERS"); raw != "" {
		brokers = strings.Split(raw, ",")
	}

	monitorEnabled := true
	if v := os.Getenv("BREACH_MONITOR_ENABLED"); v == "false" {
		monitorEnabled = false
	}

	intervalSec := 300
	if v := os.Getenv("BREACH_MONITOR_INTERVAL_SEC"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			intervalSec = n
		}
	}

	batchSize := 100
	if v := os.Getenv("BREACH_MONITOR_BATCH_SIZE"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			batchSize = n
		}
	}

	return Config{
		DatabaseURL:              os.Getenv("DATABASE_URL"),
		Port:                     port,
		CatalogAddr:              catalogAddr,
		IntelligenceAddr:         intelligenceAddr,
		IntelligenceSecret:       intelligenceSecret,
		ServiceJWTIssuer:         serviceJWTIssuer,
		IntelligenceTimeoutSec:   intelligenceTimeoutSec,
		KafkaBrokers:             brokers,
		BreachMonitorEnabled:     monitorEnabled,
		BreachMonitorIntervalSec: intervalSec,
		BreachMonitorBatchSize:   batchSize,
	}
}
