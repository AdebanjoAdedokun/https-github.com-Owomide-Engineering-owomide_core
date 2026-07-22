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
		KafkaBrokers:             brokers,
		BreachMonitorEnabled:     monitorEnabled,
		BreachMonitorIntervalSec: intervalSec,
		BreachMonitorBatchSize:   batchSize,
	}
}
