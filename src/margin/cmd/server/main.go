package main

import (
	"context"
	"log/slog"
	"net"
	"os"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	buspkg "github.com/owomide/bus/pkg/bus"
	"github.com/owomide/margin/internal/client"
	"github.com/owomide/margin/internal/config"
	"github.com/owomide/margin/internal/db"
	"github.com/owomide/margin/internal/handler"
	"github.com/owomide/margin/internal/monitor"
	"github.com/owomide/margin/internal/repo"
	marginpb "github.com/owomide/proto/services/margin/v1"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cfg := config.Load()

	database, err := db.New(cfg.DatabaseURL)
	if err != nil {
		logger.Error("connect db", "error", err)
		os.Exit(1)
	}
	defer database.Close()

	catalogConn, err := grpc.NewClient(cfg.CatalogAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		logger.Error("connect catalog", "error", err)
		os.Exit(1)
	}
	defer func() { _ = catalogConn.Close() }()

	r := repo.New()
	catalogClient := client.NewCatalogClient(catalogConn)

	intelligenceConn, err := grpc.NewClient(
		cfg.IntelligenceAddr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		logger.Error("connect intelligence", "error", err)
		os.Exit(1)
	}
	defer func() { _ = intelligenceConn.Close() }()
	intelligenceClient, err := client.NewIntelligenceClient(
		intelligenceConn,
		cfg.IntelligenceSecret,
		cfg.ServiceJWTIssuer,
		time.Duration(cfg.IntelligenceTimeoutSec)*time.Second,
	)
	if err != nil {
		logger.Error("configure intelligence", "error", err)
		os.Exit(1)
	}

	svc := handler.NewRulesServer(database, r, logger, catalogClient, intelligenceClient)

	if cfg.BreachMonitorEnabled {
		b, err := buspkg.New(buspkg.Config{
			Provider: "kafka",
			Kafka:    buspkg.KafkaConfig{Brokers: cfg.KafkaBrokers, ClientID: "margin-svc"},
		})
		if err != nil {
			logger.Error("init bus", "error", err)
			os.Exit(1)
		}
		defer func() { _ = b.Publisher.Close() }()

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		mon := monitor.New(
			database, r, catalogClient, catalogClient,
			intelligenceClient,
			b.Publisher,
			time.Duration(cfg.BreachMonitorIntervalSec)*time.Second,
			cfg.BreachMonitorBatchSize,
			logger,
		)
		mon.Start(ctx)
		logger.Info("breach monitor started", "interval_sec", cfg.BreachMonitorIntervalSec)
	}

	lis, err := net.Listen("tcp", ":"+cfg.Port)
	if err != nil {
		logger.Error("listen", "error", err)
		os.Exit(1)
	}

	s := grpc.NewServer()
	marginpb.RegisterMarginServiceServer(s, svc)

	logger.Info("margin service listening", "port", cfg.Port)
	if err := s.Serve(lis); err != nil {
		logger.Error("serve", "error", err)
		os.Exit(1)
	}
}
