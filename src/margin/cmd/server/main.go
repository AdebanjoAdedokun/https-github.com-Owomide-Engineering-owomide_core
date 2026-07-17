package main

import (
	"log/slog"
	"net"
	"os"

	"google.golang.org/grpc"

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

	r := repo.New()
	svc := handler.NewRulesServer(database, r, logger)

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
