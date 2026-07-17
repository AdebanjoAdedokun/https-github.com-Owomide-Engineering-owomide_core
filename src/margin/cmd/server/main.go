package main

import (
	"log"
	"net"

	"google.golang.org/grpc"

	"github.com/owomide/margin/internal/config"
	"github.com/owomide/margin/internal/db"
	"github.com/owomide/margin/internal/handler"
	"github.com/owomide/margin/internal/repo"
	marginpb "github.com/owomide/proto/services/margin/v1"
)

func main() {
	cfg := config.Load()

	database, err := db.New(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect db: %v", err)
	}
	defer database.Close()

	r := repo.New()
	svc := handler.NewRulesServer(database, r)

	lis, err := net.Listen("tcp", ":"+cfg.Port)
	if err != nil {
		log.Fatalf("listen: %v", err)
	}

	s := grpc.NewServer()
	marginpb.RegisterMarginServiceServer(s, svc)

	log.Printf("margin service listening on :%s", cfg.Port)
	if err := s.Serve(lis); err != nil {
		log.Fatalf("serve: %v", err)
	}
}
