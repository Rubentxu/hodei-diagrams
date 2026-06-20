# Hodei Diagrams — justfile
# https://github.com/casey/just
#
# All recipes are idempotent and self-contained. They detect their
# prerequisites and print clear, actionable errors if something is missing.

set shell := ["bash", "-uc"]

# ─── Configuration ──────────────────────────────────────────────────────────

WORKSPACE_ROOT := justfile_directory()
WASM_CRATE     := "crates/diagram-wasm"
WASM_OUT_DIR   := join(WORKSPACE_ROOT, "web-shell", "src", "wasm")
WEB_SHELL_DIR  := join(WORKSPACE_ROOT, "web-shell")
VITE_PORT      := "4100"

# ─── Rust Workspace ──────────────────────────────────────────────────────────

# Fast type-check only (no binary)
check:
    cargo check --workspace

# Full build
build:
    cargo build --workspace

# Run all workspace tests (parallel via nextest if available)
test *args:
    @if command -v cargo-nextest > /dev/null 2>&1; then \
        cargo nextest run --workspace {{args}}; \
    else \
        cargo test --workspace {{args}}; \
    fi

# Format code
fmt:
    cargo fmt --all

# Check formatting (CI)
fmt-check:
    cargo fmt --all -- --check

# Clippy with warnings as errors
lint:
    cargo clippy --workspace --all-targets -- -D warnings

# Full CI verification
verify: fmt-check lint check test

# ─── Web Shell (TypeScript) ─────────────────────────────────────────────────

# Install web-shell dependencies
web-install:
    @echo "📦 Installing web-shell dependencies…"
    cd {{WEB_SHELL_DIR}} && npm install

# TypeScript type check
web-typecheck:
    cd {{WEB_SHELL_DIR}} && npx tsc --noEmit

# Run Vitest unit tests
web-test *args:
    cd {{WEB_SHELL_DIR}} && npx vitest run {{args}}

# Run Playwright E2E tests
web-e2e *args:
    cd {{WEB_SHELL_DIR}} && npx playwright test {{args}}

# Web-shell dev server (alias)
web-dev:
    cd {{WEB_SHELL_DIR}} && npx vite --port {{VITE_PORT}} --strictPort

# Web-shell full verify (lint + typecheck + wasm + build)
web-verify: web-wasm
    @echo "🔍 Linting, typechecking and building web-shell…"
    cd {{WEB_SHELL_DIR}} && npm run verify

# ─── WASM Pipeline ──────────────────────────────────────────────────────────

# Verify WASM toolchain is available
_check-wasm-prereqs:
    @command -v wasm-pack >/dev/null || { echo "❌ wasm-pack not installed. Run: cargo install wasm-pack"; exit 1; }
    @command -v cargo      >/dev/null || { echo "❌ cargo not installed"; exit 1; }
    @command -v node       >/dev/null || { echo "❌ Node.js not installed"; exit 1; }

# Build WASM artifact for the web-shell (absolute out-dir; wasm-pack resolves relative paths against the wasm crate directory)
web-wasm: _check-wasm-prereqs
    @echo "🦀 Compiling Rust → WASM (target=web)…"
    wasm-pack build --target web {{WASM_CRATE}} --out-dir "{{WASM_OUT_DIR}}"
    @echo "✅ WASM built at {{WASM_OUT_DIR}}"

# Install web-shell dependencies only if node_modules is missing
_ensure-deps:
    @if [ ! -d "{{WEB_SHELL_DIR}}/node_modules" ]; then just web-install; else echo "✅ node_modules present"; fi

# ─── One-shot Commands ──────────────────────────────────────────────────────

# Full pipeline: check prereqs → npm install (if needed) → wasm build →
# vite dev server at http://localhost:4100
dev: _check-wasm-prereqs _ensure-deps web-wasm
    @echo ""
    @echo "⚡ Hodei Diagrams ready at http://localhost:{{VITE_PORT}}"
    @echo ""
    cd {{WEB_SHELL_DIR}} && npx vite --port {{VITE_PORT}} --strictPort

# Full pipeline: WASM + build + E2E tests in headless browser
e2e: _check-wasm-prereqs web-wasm
    @echo "🎭 Running Playwright E2E suite…"
    cd {{WEB_SHELL_DIR}} && npx playwright test

# Full CI: Rust verify + WASM + TypeScript verify + E2E
ci: verify web-wasm
    @echo "🎭 Running Playwright E2E suite…"
    cd {{WEB_SHELL_DIR}} && npx playwright test

# Production build of the web-shell (requires WASM up-to-date)
web-build: web-wasm
    @echo "📦 Building production bundle…"
    cd {{WEB_SHELL_DIR}} && npx vite build

# ─── Combined ───────────────────────────────────────────────────────────────

# Full verification (Rust + Web Shell)
all-verify: verify web-verify

# Run everything (verify Rust + verify Web Shell + E2E)
all: verify web-verify e2e

# ─── Diagnostics ────────────────────────────────────────────────────────────

# Show current branch and recent commits
status:
    git status --short
    @echo "---"
    git log --oneline -5

# Verify the dev environment is fully wired
doctor:
    @echo "🩺 Hodei Diagrams — environment doctor"
    @echo "  rustc:     $(rustc --version 2>/dev/null || echo 'MISSING')"
    @echo "  cargo:     $(cargo --version 2>/dev/null || echo 'MISSING')"
    @echo "  wasm-pack: $(wasm-pack --version 2>/dev/null || echo 'MISSING')"
    @echo "  node:      $(node --version 2>/dev/null || echo 'MISSING')"
    @echo "  npm:       $(npm --version 2>/dev/null || echo 'MISSING')"
    @echo "  npx:       $(npx --version 2>/dev/null || echo 'MISSING')"
    @echo ""
    @echo "📁 node_modules: $([ -d web-shell/node_modules ] && echo 'present' || echo 'MISSING')"
    @echo "🦀 WASM artifact: $([ -f {{WASM_OUT_DIR}}/diagram_wasm_bg.wasm ] && stat -c '%y' {{WASM_OUT_DIR}}/diagram_wasm_bg.wasm || echo 'MISSING')"

# ─── Default ────────────────────────────────────────────────────────────────

default: doctor
