#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# WhatHappen — Truth Test Runner
# ─────────────────────────────────────────────────────────────
# Runs the Upload + ETL truth-test harness in two modes:
#
#   Direct mode (default):
#     MOCK_APIS=true tsx tests/truth-tests/upload-etl-harness.ts
#     Imports route handlers directly, no server needed.
#
#   Server mode:
#     Starts Next.js dev server in background, runs harness
#     against it via HTTP, then tears down.
#
# Usage:
#   bash scripts/run-truth-tests.sh              # direct mode
#   bash scripts/run-truth-tests.sh --serve      # server mode
#   bash scripts/run-truth-tests.sh --help       # this message
#
# Requirements:
#   - Node >= 18
#   - npm install ran (node_modules present)
#   - zip CLI for ZIP tests (optional — tests skip if absent)
# ─────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HARNESS="$PROJECT_DIR/tests/truth-tests/upload-etl-harness.ts"
NEXT_DEV_PID=""

cd "$PROJECT_DIR"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  WhatHappen Truth-Test Runner            ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════╝${NC}"
echo ""

# ── Parse args ──
MODE="direct"
for arg in "$@"; do
  case "$arg" in
    --serve|--server)
      MODE="server"
      ;;
    --help)
      echo "Usage: bash scripts/run-truth-tests.sh [--serve|--help]"
      echo ""
      echo "  (no flag)  Direct mode — import handlers directly, no server needed"
      echo "  --serve    Server mode — boot Next.js dev server, test via HTTP"
      echo "  --help     Show this message"
      exit 0
      ;;
  esac
done

# ── Pre-flight checks ──
if [ ! -f "$HARNESS" ]; then
  echo -e "${RED}❌ Harness not found at $HARNESS${NC}"
  exit 1
fi

if [ ! -d "$PROJECT_DIR/node_modules" ]; then
  echo -e "${YELLOW}⚠️  node_modules missing. Running npm install...${NC}"
  npm install --silent
fi

if ! command -v npx &> /dev/null; then
  echo -e "${RED}❌ npx not found. Install Node >= 18.${NC}"
  exit 1
fi

# Check zip CLI availability
ZIP_AVAILABLE=false
if command -v zip &> /dev/null; then
  ZIP_AVAILABLE=true
  echo -e "  ${GREEN}✓${NC} zip CLI available (ZIP tests enabled)"
else
  echo -e "  ${YELLOW}⚠${NC} zip CLI not found (ZIP tests will be skipped)"
fi

echo ""

# ── Run harness ──
EXIT_CODE=0

if [ "$MODE" = "server" ]; then
  echo -e "${CYAN}▶ Server mode: starting Next.js dev server...${NC}"

  # Start next dev in background
  MOCK_APIS=true npx next dev -p 3899 &
  NEXT_DEV_PID=$!

  # Wait for server to be ready
  echo -n "  ⏳ Waiting for server..."
  SERVER_READY=false
  for i in $(seq 1 30); do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3899/api/process-file 2>/dev/null | grep -q "405\|400\|200"; then
      SERVER_READY=true
      echo -e " ${GREEN}ready (attempt $i)${NC}"
      break
    fi
    sleep 1
    echo -n "."
  done

  if [ "$SERVER_READY" = false ]; then
    echo -e "\n${RED}❌ Server not ready after 30s${NC}"
    kill "$NEXT_DEV_PID" 2>/dev/null || true
    exit 1
  fi

  echo -e "${GREEN}  ✓ Server running at http://localhost:3899${NC}"
  echo ""

  # Run harness
  API_BASE=http://localhost:3899 MOCK_APIS=true npx tsx "$HARNESS" || EXIT_CODE=$?

  # Cleanup
  echo ""
  echo -e "${CYAN}▶ Shutting down Next.js dev server...${NC}"
  kill "$NEXT_DEV_PID" 2>/dev/null || true
  wait "$NEXT_DEV_PID" 2>/dev/null || true
  echo -e "${GREEN}  ✓ Server stopped${NC}"

else
  echo -e "${CYAN}▶ Direct mode: importing handlers directly${NC}"
  echo ""

  MOCK_APIS=true npx tsx "$HARNESS" || EXIT_CODE=$?
fi

echo ""

if [ $EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  ALL TRUTH TESTS PASSED${NC}"
  echo -e "${GREEN}════════════════════════════════════════════${NC}"
else
  echo -e "${RED}════════════════════════════════════════════${NC}"
  echo -e "${RED}  SOME TRUTH TESTS FAILED (exit code $EXIT_CODE)${NC}"
  echo -e "${RED}════════════════════════════════════════════${NC}"
fi

exit $EXIT_CODE
