package health

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

type ReadinessCheck func(context.Context) error

func NewHandler(check ReadinessCheck) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(response http.ResponseWriter, _ *http.Request) {
		writeJSON(response, http.StatusOK, "ok")
	})
	mux.HandleFunc("GET /readyz", func(response http.ResponseWriter, request *http.Request) {
		ctx, cancel := context.WithTimeout(request.Context(), 2*time.Second)
		defer cancel()
		if check == nil || check(ctx) != nil {
			writeJSON(response, http.StatusServiceUnavailable, "not_ready")
			return
		}
		writeJSON(response, http.StatusOK, "ready")
	})
	return mux
}

func writeJSON(response http.ResponseWriter, status int, state string) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(map[string]string{"status": state})
}
