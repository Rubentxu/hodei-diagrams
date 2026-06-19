# web-shell — Hodei Diagrams

TypeScript viewer shell for the Hodei Diagrams Diagram Engine. Loads `.drawio` files and renders them as SVG via the Rust engine through WASM.

## Architecture

- **Viewer-only v1**: Import `.drawio` + render SVG. No editing capabilities.
- **Editor v1.1**: Click-to-select, drag-to-move, delete, undo/redo (Ctrl+Z/Y), palette (rectangle/ellipse). All mutations via `executeCommand`.
- **DiagramEngineSession**: Single TypeScript class wrapping the WASM bridge. All engine communication goes through it.
- **SVG-string injection**: The engine renders SVG strings; the shell injects them into the DOM.
- **editor.ts**: New module for hit-testing, selection state, drag FSM, command construction. Never imports `./wasm`.
- **NO domain logic, NO style logic, NO editing logic** — everything delegates to the Rust engine. Shell only builds command JSON payloads.

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
| `npm test` | Vitest unit tests (83 tests) |
| `npm run test:e2e` | Playwright E2E tests (12 tests) |
| `npm run verify` | Full verification pipeline |

## Directory Structure

```
web-shell/
├── index.html          # Entry HTML
├── src/
│   ├── main.ts         # Entry: load WASM → create session → wire UI
│   ├── session.ts      # DiagramEngineSession — sole WASM boundary
│   ├── wasm-loader.ts  # WASM module loading
│   ├── renderer.ts     # SVG injection into DOM, applySelectionClass
│   ├── ui.ts           # File input, page nav, error display, toolbar
│   ├── editor.ts       # Hit-test, selection, drag FSM, command builders
│   └── types.ts        # Branded types, Result<T>, PageRender, SlotmapId, ScenePage
├── tests/
│   ├── session.test.ts # Vitest unit tests (mocked WASM)
│   └── e2e/
│       └── viewer.spec.ts  # Playwright E2E (real WASM)
└── pkg/                # wasm-pack output (gitignored)
```

## Status

**v0.5.2** — Viewer v1 + Editor v1.1 complete. 83 unit tests + 12 E2E tests passing.
Capabilities: import, page navigation, click-to-select, drag-to-move, delete, undo/redo, palette (rectangle + ellipse).
