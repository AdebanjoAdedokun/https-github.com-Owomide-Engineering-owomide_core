package main

import (
	"log/slog"
	"net"
	"os"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"github.com/owomide/margin/internal/client"
	"github.com/owomide/margin/internal/config"
	"github.com/owomide/margin/internal/db"
	"github.com/owomide/margin/internal/handler"
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
	costFetcher := client.NewCatalogClient(catalogConn)
	svc := handler.NewRulesServer(database, r, logger, costFetcher)

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
