package health

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestHealthAndReadiness(t *testing.T) {
	ready := true
	handler := NewHandler(func(context.Context) error {
		if ready {
			return nil
		}
		return errors.New("database unavailable")
	})

	health := httptest.NewRecorder()
	handler.ServeHTTP(health, httptest.NewRequest(http.MethodGet, "/health", nil))
	require.Equal(t, http.StatusOK, health.Code)
	require.JSONEq(t, `{"status":"ok"}`, health.Body.String())

	readiness := httptest.NewRecorder()
	handler.ServeHTTP(readiness, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	require.Equal(t, http.StatusOK, readiness.Code)
	require.JSONEq(t, `{"status":"ready"}`, readiness.Body.String())

	ready = false
	notReady := httptest.NewRecorder()
	handler.ServeHTTP(notReady, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	require.Equal(t, http.StatusServiceUnavailable, notReady.Code)
	require.JSONEq(t, `{"status":"not_ready"}`, notReady.Body.String())
}

func TestUnknownHealthRoute(t *testing.T) {
	response := httptest.NewRecorder()
	NewHandler(func(context.Context) error { return nil }).ServeHTTP(
		response,
		httptest.NewRequest(http.MethodGet, "/unknown", nil),
	)
	require.Equal(t, http.StatusNotFound, response.Code)
}
