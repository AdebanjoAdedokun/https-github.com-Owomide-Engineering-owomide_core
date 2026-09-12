package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	buspkg "github.com/owomide/bus/pkg/bus"
	"github.com/owomide/margin/internal/auth"
	"github.com/owomide/margin/internal/client"
	"github.com/owomide/margin/internal/config"
	"github.com/owomide/margin/internal/db"
	"github.com/owomide/margin/internal/handler"
	healthhandler "github.com/owomide/margin/internal/health"
	"github.com/owomide/margin/internal/monitor"
	"github.com/owomide/margin/internal/repo"
	marginpb "github.com/owomide/proto/services/margin/v1"
)

const shutdownTimeout = 10 * time.Second

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(logger); err != nil {
		logger.Error("margin service stopped", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}
	rootCtx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	database, err := db.New(cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connect db: %w", err)
	}
	defer database.Close()
	readyCtx, cancelReady := context.WithTimeout(rootCtx, 10*time.Second)
	defer cancelReady()
	if err := database.Ready(readyCtx); err != nil {
		return fmt.Errorf("ping db: %w", err)
	}

	authenticator, err := auth.NewAuthenticator(
		cfg.ServiceJWTIssuer,
		"margin",
		cfg.ServiceSecrets,
		map[string][]string{
			marginpb.MarginService_ValidateBatch_FullMethodName:  {"gateway_svc", "proposal_svc"},
			marginpb.MarginService_ListRules_FullMethodName:      {"gateway_svc"},
			marginpb.MarginService_UpsertRule_FullMethodName:     {"gateway_svc"},
			marginpb.MarginService_DeactivateRule_FullMethodName: {"gateway_svc"},
		},
	)
	if err != nil {
		return fmt.Errorf("configure service authentication: %w", err)
	}

	catalogConn, err := grpc.NewClient(cfg.CatalogAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return fmt.Errorf("connect catalog: %w", err)
	}
	defer func() { _ = catalogConn.Close() }()
	catalogClient, err := client.NewCatalogClient(
		catalogConn,
		cfg.CatalogSecret,
		cfg.ServiceJWTIssuer,
		time.Duration(cfg.CatalogTimeoutSec)*time.Second,
	)
	if err != nil {
		return fmt.Errorf("configure catalog client: %w", err)
	}

	intelligenceConn, err := grpc.NewClient(
		cfg.IntelligenceAddr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		return fmt.Errorf("connect intelligence: %w", err)
	}
	defer func() { _ = intelligenceConn.Close() }()
	intelligenceClient, err := client.NewIntelligenceClient(
		intelligenceConn,
		cfg.IntelligenceSecret,
		cfg.ServiceJWTIssuer,
		time.Duration(cfg.IntelligenceTimeoutSec)*time.Second,
	)
	if err != nil {
		return fmt.Errorf("configure intelligence client: %w", err)
	}

	rbacConn, err := grpc.NewClient(cfg.RbacAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return fmt.Errorf("connect rbac: %w", err)
	}
	defer func() { _ = rbacConn.Close() }()
	rbacClient, err := client.NewRbacClient(
		rbacConn,
		cfg.RbacSecret,
		cfg.ServiceJWTIssuer,
		time.Duration(cfg.RbacTimeoutSec)*time.Second,
	)
	if err != nil {
		return fmt.Errorf("configure rbac client: %w", err)
	}

	r := repo.New()
	svc := handler.NewRulesServer(database, r, logger, catalogClient, intelligenceClient, rbacClient)
	if cfg.BreachMonitorEnabled {
		bus, err := buspkg.New(buspkg.Config{
			Provider: "kafka",
			Kafka:    buspkg.KafkaConfig{Brokers: cfg.KafkaBrokers, ClientID: "margin-svc"},
		})
		if err != nil {
			return fmt.Errorf("init bus: %w", err)
		}
		defer func() { _ = bus.Publisher.Close() }()
		mon := monitor.New(
			database,
			r,
			catalogClient,
			catalogClient,
			intelligenceClient,
			bus.Publisher,
			time.Duration(cfg.BreachMonitorIntervalSec)*time.Second,
			cfg.BreachMonitorBatchSize,
			logger,
		)
		mon.Start(rootCtx)
		logger.Info("breach monitor started", "interval_sec", cfg.BreachMonitorIntervalSec)
	}

	grpcListener, err := net.Listen("tcp", net.JoinHostPort(cfg.Host, cfg.Port))
	if err != nil {
		return fmt.Errorf("listen gRPC: %w", err)
	}
	grpcServer := grpc.NewServer(grpc.UnaryInterceptor(authenticator.UnaryServerInterceptor()))
	marginpb.RegisterMarginServiceServer(grpcServer, svc)
	healthServer := &http.Server{
		Addr:              net.JoinHostPort(cfg.HealthHost, cfg.HealthPort),
		Handler:           healthhandler.NewHandler(database.Ready),
		ReadHeaderTimeout: 5 * time.Second,
	}

	serveErrors := make(chan error, 2)
	go func() {
		if err := grpcServer.Serve(grpcListener); err != nil {
			serveErrors <- fmt.Errorf("serve gRPC: %w", err)
		}
	}()
	go func() {
		if err := healthServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErrors <- fmt.Errorf("serve health: %w", err)
		}
	}()
	logger.Info("margin service listening", "grpc_port", cfg.Port, "health_port", cfg.HealthPort)

	var serveErr error
	select {
	case <-rootCtx.Done():
	case serveErr = <-serveErrors:
		stop()
	}

	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancelShutdown()
	grpcStopped := make(chan struct{})
	go func() {
		grpcServer.GracefulStop()
		close(grpcStopped)
	}()
	select {
	case <-grpcStopped:
	case <-shutdownCtx.Done():
		grpcServer.Stop()
	}
	if err := healthServer.Shutdown(shutdownCtx); err != nil && serveErr == nil {
		serveErr = fmt.Errorf("shutdown health server: %w", err)
	}
	return serveErr
}
