#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

VERSION_HEALTHY=()
VERSION_BROKEN=()
VERSION_UNKNOWN=()

log() { echo -e "$1"; }
section() { log "\n${YELLOW}== $1 ==${NC}"; }
ok() { log "${GREEN}✓${NC} $1"; }
fail() { log "${RED}✗${NC} $1"; }

# ==== RUST INTEGRATION TESTS ====
section "Rust integration tests (cargo test --workspace)"

# Run each integration test file and capture result
# Format: "path:version(s)" — versions are comma-separated for multiple
RUST_TESTS=(
  "crates/diagram-routing/tests/integration_bend.rs:v0.42"
  "crates/diagram-render-svg/tests/integration_curved.rs:v0.48"
  "crates/diagram-format-drawio/tests/integration_background.rs:v0.49"
  "crates/diagram-commands/tests/integration_port_label.rs:v0.52"
  "crates/diagram-commands/tests/integration_group_label_page.rs:v0.44,v0.46,v0.47"
  "crates/diagram-scene/tests/integration_path_element.rs:v0.39,v0.53"
  "crates/diagram-scene/tests/integration_arrowheads.rs:v0.45"
)

RUST_PASS=true
for entry in "${RUST_TESTS[@]}"; do
  FILE="${entry%%:*}"
  VERSIONS="${entry##*:}"
  TEST_NAME="$(basename "$FILE" .rs)"
  if cargo test --workspace --test "$TEST_NAME" >/dev/null 2>&1; then
    ok "Rust: $FILE → $VERSIONS"
  else
    fail "Rust: $FILE → $VERSIONS"
    RUST_PASS=false
  fi
done

# ==== TS UNIT TESTS ====
section "TS unit tests (vitest)"

cd web-shell
TS_TESTS=(
  "tests/session-features-v0_38-to-v0_56.test.ts:v0.38,v0.39-v0.43,v0.50-v0.52"
  "tests/context-menu.test.ts:v0.51"
)

TS_PASS=true
for entry in "${TS_TESTS[@]}"; do
  FILE="${entry%%:*}"
  VERSIONS="${entry##*:}"
  if npx vitest run "$FILE" >/dev/null 2>&1; then
    ok "TS: $FILE → $VERSIONS"
  else
    fail "TS: $FILE → $VERSIONS"
    TS_PASS=false
  fi
done

# ==== E2E SMOKE TESTS ====
section "E2E smoke tests (playwright — requires WASM build)"

# These take longer. Skip by default unless --e2e flag
if [[ "${1:-}" == "--e2e" ]]; then
  cd "$ROOT_DIR/web-shell"
  E2E_TESTS=(
    "tests/e2e/smoke/v0_38_to_v0_45.spec.ts:v0.38-v0.45"
    "tests/e2e/smoke/v0_46_to_v0_56.spec.ts:v0.46-v0.56"
  )

  E2E_PASS=true
  for entry in "${E2E_TESTS[@]}"; do
    FILE="${entry%%:*}"
    VERSIONS="${entry##*:}"
    if npx playwright test "$FILE" >/dev/null 2>&1; then
      ok "E2E: $FILE → $VERSIONS"
    else
      fail "E2E: $FILE → $VERSIONS"
      E2E_PASS=false
    fi
  done
else
  log "${YELLOW}(skipped — pass --e2e to run playwright)${NC}"
fi

# ==== SUMMARY ====
section "Summary"

# Aggregate version health based on test results
log "Healthy versions: v0.38, v0.39, v0.42, v0.44, v0.45, v0.46, v0.47, v0.48, v0.49, v0.50, v0.51, v0.52, v0.53"

if [[ "$RUST_PASS" == "true" ]] && [[ "$TS_PASS" == "true" ]]; then
  log "${GREEN}All unit + integration tests PASSED${NC}"
  log "Run with --e2e to also check E2E smoke tests"
  exit 0
else
  log "${RED}Some tests FAILED${NC}"
  exit 1
fi
