# web-shell — Hodei Diagrams

TypeScript viewer shell for the Hodei Diagrams Diagram Engine. Loads `.drawio` files and renders them as SVG via the Rust engine through WASM.

## Architecture

- **Viewer-only v1**: Import `.drawio` + render SVG. No editing capabilities.
- **DiagramEngineSession**: Single TypeScript class wrapping the WASM bridge. All engine communication goes through it.
- **SVG-string injection**: The engine renders SVG strings; the shell injects them into the DOM. No Scene JSON parsing in the shell.
- **NO domain logic, NO style logic, NO editing logic** — everything delegates to the Rust engine.

The shell is **outside** the Rust workspace (`crates/`). See:
- `docs/adr/0002-typescript-web-shell-rust-engine.md`
- `docs/adr/0004-minimal-wasm-boundary-with-shared-buffers.md`
- `docs/adr/0017-diagram-wasm-as-thin-technical-adapter.md`
- `docs/adr/0041-web-shell-toolchain.md`

## Quick Start

```bash
# Prerequisites
cargo install wasm-pack
npm install

# Build WASM + TypeScript
npm run build:wasm
npm run dev       # Vite dev server with HMR

# Verify everything
npm run verify    # lint + typecheck + unit tests + wasm build + vite build

# E2E tests (requires Chromium)
npm run test:e2e
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Vite production build |
| `npm run build:wasm` | Build diagram-wasm for wasm32 target |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript strict check |
| `npm test` | Vitest unit tests (26 tests) |
| `npm run test:e2e` | Playwright E2E tests (6 tests) |
| `npm run verify` | Full verification pipeline |

## Directory Structure

```
web-shell/
├── index.html          # Entry HTML
├── src/
│   ├── main.ts         # Entry: load WASM → create session → wire UI
│   ├── session.ts      # DiagramEngineSession — sole WASM boundary
│   ├── wasm-loader.ts  # WASM module loading
│   ├── renderer.ts     # SVG injection into DOM
│   ├── ui.ts           # File input, page nav, error display
│   └── types.ts        # Branded types, Result<T>, PageRender
├── tests/
│   ├── session.test.ts # Vitest unit tests (mocked WASM)
│   └── e2e/
│       └── viewer.spec.ts  # Playwright E2E (real WASM)
└── pkg/                # wasm-pack output (gitignored)
```

## Status

**v0.5.1** — Viewer-only v1 complete. 26 unit tests + 6 E2E tests passing.
Editor surface deferred to v1.1.
