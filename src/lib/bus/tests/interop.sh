#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "=== Cross-language interop test ==="
echo "Temp dir: $TMP_DIR"
echo ""

# Build Go interop binary
echo "Building Go interop binary..."
cd "$SCRIPT_DIR"
go build -o "$TMP_DIR/interop_go" interop_go.go

# JS writes → PY reads
echo ""
echo "--- JS writes → PY reads ---"
cd "$SCRIPT_DIR/../js"
npx tsx "$SCRIPT_DIR/interop_js.ts" write "$TMP_DIR/js_event.bin"
python3 "$SCRIPT_DIR/interop_py.py" read "$TMP_DIR/js_event.bin"

# PY writes → GO reads
echo ""
echo "--- PY writes → GO reads ---"
python3 "$SCRIPT_DIR/interop_py.py" write "$TMP_DIR/py_event.bin"
"$TMP_DIR/interop_go" read "$TMP_DIR/py_event.bin"

# GO writes → JS reads
echo ""
echo "--- GO writes → JS reads ---"
"$TMP_DIR/interop_go" write "$TMP_DIR/go_event.bin"
cd "$SCRIPT_DIR/../js"
npx tsx "$SCRIPT_DIR/interop_js.ts" read "$TMP_DIR/go_event.bin"

echo ""
echo "=== All interop tests PASSED ==="
