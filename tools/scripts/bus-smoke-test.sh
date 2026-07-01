#!/usr/bin/env bash
set -euo pipefail

READY_URL="${BUS_SMOKE_READY_URL:-http://localhost:5100/readyz}"
TIMEOUT_SECONDS="${BUS_SMOKE_TIMEOUT_SECONDS:-60}"
STARTED_AT="$(date +%s)"

while true; do
  if response="$(curl -fsS "$READY_URL" 2>/dev/null)"; then
    echo "Bus smoke test passed: subscriber received test.ping"
    echo "$response"
    exit 0
  fi

  now="$(date +%s)"
  if [ "$((now - STARTED_AT))" -ge "$TIMEOUT_SECONDS" ]; then
    cat >&2 <<EOF
Bus smoke test failed: no test.ping received from the subscriber readiness endpoint.

Expected: $READY_URL

Start the local stack with:
  make dev

Then retry:
  make bus-smoke-test
EOF
    exit 1
  fi

  sleep 2
done
