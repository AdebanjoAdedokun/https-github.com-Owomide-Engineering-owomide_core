package config

import "os"

type Config struct {
	DatabaseURL string
	Port        string
	CatalogAddr string
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
	return Config{
		DatabaseURL: os.Getenv("DATABASE_URL"),
		Port:        port,
		CatalogAddr: catalogAddr,
	}
}
