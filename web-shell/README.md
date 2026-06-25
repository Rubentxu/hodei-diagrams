# web-shell — Hodei Diagrams

TypeScript viewer shell for the Hodei Diagrams Diagram Engine. Loads `.drawio` files and renders them as SVG via the Rust engine through WASM.

## Architecture

- **Full Editor v1**: Complete diagram editing — shapes, edges, text, groups, layers, layouts, export. All mutations via `executeCommand`.
- **DiagramEngineSession**: Single TypeScript class wrapping the WASM bridge. All engine communication goes through it.
- **SVG-string injection**: The engine renders SVG strings; the shell injects them into the DOM.
- **editor.ts**: Module for hit-testing, selection state, drag FSM, command construction. Never imports `./wasm`.
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

| Command              | Description                          |
| -------------------- | ------------------------------------ |
| `npm run dev`        | Vite dev server                      |
| `npm run build`      | Vite production build                |
| `npm run build:wasm` | Build diagram-wasm for wasm32 target |
| `npm run lint`       | ESLint                               |
| `npm run typecheck`  | TypeScript strict check              |
| `npm test`           | Vitest unit tests (50 tests)        |
| `npm run test:e2e`   | Playwright E2E tests (35 tests)      |
| `npm run verify`     | Full verification pipeline           |

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
│   ├── types.ts        # Branded types, Result<T>, PageRender, SlotmapId, ScenePage
│   ├── sidebar.ts      # Shape palette with search filter
│   ├── navbar.ts      # Top bar with menus (File, Edit, View, Insert, Arrange, Tools)
│   ├── inspector.ts    # Right panel: style/geometry/text/effects sections
│   ├── hud.ts         # Zoom level + status bar
│   ├── rail.ts        # Left toolbar: text/zoom-fit/tools
│   ├── context-menu.ts # Right-click context menu
│   ├── history-panel.ts # Version history timeline
│   ├── version-store.ts # IndexedDB persistence layer
│   ├── export-raster.ts # PNG/PDF/HTML export
│   ├── style-keys.ts  # Style key constants
│   └── icon.ts        # SVG icon helper
├── tests/
│   ├── session.test.ts
│   ├── context-menu.test.ts
│   └── e2e/
│       ├── smoke/         # Feature smoke tests (35 E2E)
│       └── regression/     # Regression test suite
└── pkg/                # wasm-pack output (gitignored)
```

## Status

**v0.63.0** — Full editor complete. 50 unit tests + 35 E2E tests passing.
Capabilities: import/export .drawio, page tabs (add/rename/delete), click-to-select, drag-to-move, delete, undo/redo, palette (rectangle + ellipse), Ctrl+D duplicate, arrow key nudge, zoom (+/-/0), right-click context menu, shape search, background color, curved edges, port selection, edge label drag, group/ungroup, edge arrowheads, edge label editing, zoom keyboard shortcuts, zoom to fit, arrange layouts (Tree/Hierarchical/Organic/Circular/Grid), bend editing on edges, version history with IDB, PNG/PDF/HTML export, presentation mode fullscreen.
