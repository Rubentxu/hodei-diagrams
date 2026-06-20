# Hodei Diagrams — justfile
# https://github.com/casey/just

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
    cd web-shell && npm install

# Build WASM for web-shell
web-wasm:
    wasm-pack build --target web crates/diagram-wasm --out-dir ../../web-shell/src/wasm

# TypeScript type check
web-typecheck:
    cd web-shell && npx tsc --noEmit

# Run Vitest unit tests
web-test *args:
    cd web-shell && npx vitest run {{args}}

# Run Playwright E2E tests
web-e2e *args:
    cd web-shell && npx playwright test {{args}}

# ═══════════════════════════════════════════════════════════════════════════════
# ONE-SHOT COMMANDS
# ═══════════════════════════════════════════════════════════════════════════════

# Compile Rust → WASM + start Vite dev server at http://localhost:4100
dev: web-wasm
    @echo "⚡ Hodei Diagrams → http://localhost:4100"
    cd web-shell && npx vite --port 4100 --strictPort

# Full pipeline: WASM → build → E2E tests in headless browser
e2e: web-wasm
    cd web-shell && npx playwright test

# Full CI: Rust verify + WASM + TypeScript verify + E2E
ci: verify web-verify
    cd web-shell && npx playwright test

# ─── Old aliases (kept for compatibility) ─────────────────────────────────────

# Web-shell dev server (alias)
web-dev:
    cd web-shell && npm run dev

# Web-shell full verify (alias)
web-verify:
    cd web-shell && npm run verify

# ─── Combined ───────────────────────────────────────────────────────────────

# Full verification (Rust + Web Shell)
all-verify: verify web-verify

# Run everything
all: verify web-verify

# ─── Git ────────────────────────────────────────────────────────────────────

# Show current branch and recent commits
status:
    git status --short
    @echo "---"
    git log --oneline -5

# ─── Default ────────────────────────────────────────────────────────────────

default: check
