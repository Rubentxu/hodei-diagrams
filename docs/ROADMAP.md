# Roadmap — Hodei Diagrams

Estado vivo del proyecto. Actualizar en cada milestone o cambiar de dirección.
Para rationale de decisiones, ver `docs/adr/`.

## Estado Actual

**v0.28.0 — Fase 6 completada + 4 features shipped (Tree Layout, PNG, PDF, HTML Export, Presentation Mode).**
Motor Rust sólido con round-trip `.drawio` en archivo real de 4MB (21 celdas,
AWS-Admisión). 12 crates, ~460+ tests Rust, ~260+ tests E2E.
68 ADRs (0001-0068). UI con paridad ~55% vs draw.io. Próximo: Fase 9 — Toolbar/Status bar.

| Crate | Capa | Status |
|-------|------|--------|
| `diagram-core` | Dominio | ✅ |
| `diagram-format-drawio` | Compatibilidad | ✅ |
| `diagram-commands` | Comandos | ✅ (12 commands) |
| `diagram-compat-testkit` | Testing | ✅ |
| `diagram-scene` | Proyección | ✅ |
| `diagram-render-svg` | Render SVG | ✅ |
| `diagram-render-wgpu` | Render WebGPU | ✅ |
| `diagram-wasm` | WASM Bridge | ✅ (12 exports) |
| `diagram-routing` | Routing | ✅ (engine) / ⚠️ (UI) |
| `diagram-layout` | Layout | ✅ (engine) / ⚠️ (UI) |
| `web-shell/` | UI (TypeScript) | ✅ viewer + editor mínimo |

> **v1.0.0 NO se alcanzará automáticamente.** El release de v1.0.0 será
> decisión del usuario cuando considere que el producto está estable.
> Hasta entonces, las versiones siguen el patrón `v0.X.Y` con cadencia
> continua.

---

## 🎯 Active Track: Paridad Funcional con draw.io

**Plan documentado en ADRs 0050-0062.** Fases 0-6 completadas. La UI tiene
**~45% de paridad** con draw.io. El plan cubre 8 fases secuenciales.
Fase 9 (Toolbar/Status bar) pendiente de priorizar.

| Fase | Tag | Foco | ADRs | Estado |
|------|-----|------|------|--------|
| 0. Edges interactivos | v0.9.0 | Conectores en UI | 0050, 0051 | ✅ Completada |
| 1. Shape catalog | v0.10.0 | Diamond, Triangle, Hexagon, Cylinder, Cloud, Parallelogram, Trapezoid, Polygon | 0052, 0053 | ✅ Completada |
| 2. Multi-selection | v0.11.0 | Set selection, batch commands, marquee, copy/paste | 0054, 0055 | ✅ Completada |
| 3. Text editing | v0.12.0 | Inline label edit (desbloquea 6 tests skipped) | 0056 | ✅ Completada |
| 4. Rotate/flip | v0.13.0 | Transform en geometry, resize handles | 0057 | ✅ Completada |
| 5. Layers | v0.14.0 | Z-order, lock, visibility, ordering | 0058 | ✅ Completada (PR-L1) |
| 6. Stencils | v0.18.0 | XML library parsing, WASM cache, scene resolution, web-shell loading | 0059, 0062 | ✅ Completada (PR #44) |
| 7. Snap/align | v0.16.0 | Snap to grid, guides, alignment, distribute | 0060 | ✅ Completada (PR #41, #42) |
| 8. Effects | v0.17.0 | Shadow, glass, gradient (SVG-native) | 0061 | ✅ Completada (PR #43) |
| **v1.0.0** | **NO automático** | Decisión del usuario | — | — |
| 9. Toolbar/Status bar | PENDIENTE | Toolbar, status bar, progress indicators | — | ⏸️ Priorizar |

### Fase 0 — Edges interactivos (PR-E1)
- **Rust**: `ConnectVerticesCommand`, `DisconnectEdgeCommand`, edge.style routing
- **WASM**: `connect_vertices(from, to, routing_kind)`, `route_all_edges()`
- **TS**: `Editor.connectMode`, two-click creation, ESC cancel, hover preview
- **Tests**: 25 E2E (crear/mover/undo/disconnect)
- **ADRs**: 0050, 0051

### Fase 1 — Shape catalog (PR-S1, S2)
- **Rust**: ShapeKind nuevos (Diamond, Triangle, Hexagon, Cylinder, Cloud, Parallelogram, Trapezoid), PolygonElement
- **Rust (scene/renderer)**: nuevos VisualElements + SVG paths
- **Rust (format)**: to_raw/from_raw
- **TS (sidebar)**: Basic expandida con thumbnails
- **Tests**: 20 E2E + round-trip por shape
- **ADRs**: 0052, 0053

### Fase 2 — Multi-selection (PR-M1, M2)
- **TS**: `Set<SlotmapId>` selection, marquee, batch commands via Transaction
- **TS**: copy/paste (internal clipboard v1, system clipboard v2)
- **Engine**: sin cambios (selection-agnostic)
- **Tests**: 30 E2E (multi-select, batch move/delete, copy/paste)
- **ADRs**: 0054, 0055

### Fase 3 — Text editing (PR-T1)
- **TS**: dbl-click → DOM overlay input, F2, Enter, Escape, debounce 200ms
- **Engine**: usa `EditVertexLabel` existente
- **Tests**: 6 E2E (un-skip de los actuales skipped)
- **ADR**: 0056

### Fase 4 — Rotate/flip (PR-R1, R2)
- **Rust**: `CellGeometry` con rotation/flip_h/flip_v
- **Rust (commands)**: RotateCommand, FlipCommand
- **Rust (format)**: round-trip `mxGeometry rotate="45"`
- **TS (editor)**: rotate con R, flip con H/V, resize handles (corner only v1)
- **Tests**: 15 E2E
- **ADR**: 0057

### Fase 5 — Layers (PR-L1, L2)
- **Rust**: `Vertex.z_order`, `locked`, `visible`
- **Rust (commands)**: BringToFront, SendToBack, BringForward, SendBackward
- **TS (inspector)**: Behavior tab con Lock/Visibility
- **TS (bottom)**: Layers panel opcional
- **Tests**: 15 E2E
- **ADR**: 0058

### Fase 6 — Stencils (PR-ST1, ST2, ST3) ✅
- **Rust (stencils)**: `Stencil::normalize()`, `parse_stencil_library()` multi-shape XML parser
- **Rust (scene)**: `StencilProvider` trait, `SceneBuilder.with_stencil_provider()`, `stencil:<library>:<name>` resolution
- **WASM**: `StencilDto` con bg/fg path arrays, `parse_stencil_library_xml`, `WasmEngine` con cache `HashMap<String, Vec<Stencil>>`
- **TS**: `loadStencilLibrary()`, `general.xml` fixture copiado a web-shell
- **ADR**: 0059 (path format), 0062 (parse-time normalization)

### Fase 7 — Snap/align (PR-SP1, SP2)
- **TS**: snap to grid (8px), snap to shape, guides visuales
- **TS (editor)**: align (Left/Center/Right/Top/Middle/Bottom), distribute, make-same-size
- **Engine**: nuevos `ResizeVertex` command(s)
- **Tests**: 15 E2E
- **ADR**: 0060

### Fase 8 — Effects (PR-EFF1, EFF2)
- **Rust (scene)**: ResolvedStyle con shadow, glass, gradient
- **Rust (renderer)**: SVG `<filter>`, `<linearGradient>`, defs por página
- **TS (inspector)**: controles shadow/glass/gradient
- **Tests**: 15 E2E
- **ADR**: 0061

---

## ✅ Released — MVP

### Tree Layout with Moen Algorithm (ADR-0067)
- **PR**: feat/tree-layout-moen (PR #56)
- **Feature**: Tree layout using Moen (Compact Tree) algorithm ported from `mxCompactTreeLayout.js`. Provides hierarchical tree layouts with jetty routing and group bounding-box resize.
- **Trigger**: `apply_layout(Tree)` WASM export
- **ADRs**: 0067 (Tree Layout Moen)
- **Algorithm**: 7-stage Moen: validate_tree → build_tree_nodes → first_walk → second_walk → apply_coordinates → local_edge_processing → adjust_parents
- **Validation**: Strict tree validation (typed errors: MultipleRoots, CycleDetected, MultipleParents, NoRoot)
- **Commands**: `MoveGroupPayload`, `SetEdgeWaypointsPayload` (apply/undo symmetry)
- **Fixtures**: 10 golden fixtures (chain-3, balanced-7, imbalanced-6, wide-9, deep-20, left-to-right-4, group-with-children + 3 negative validation)

### HTML Export as Standalone SVG Wrapper
- **PR**: feat/html-export
- **Feature**: Standalone HTML export wrapping the engine's SVG output. HTML menu item in File > Export submenu with `downloadHtml()` function creating a self-contained HTML file.
- **Trigger**: File > Export > HTML
- **Invariant**: Zero Rust/WASM surface; HTML is assembled entirely in the web shell from engine SVG output
- **Code**: `downloadHtml()` in `web-shell/src/main.ts:165-180`, menu wiring at `main.ts:905-917`, navbar item at `navbar.ts:99-104`
- **Tests**: E2E `export-advanced.spec.ts` (7 tests), vitest 136 passed, playwright 258 passed

### PNG Export via SVG Rasterization
- **PR**: feat/png-export (PR #53)
- **Feature**: Browser Canvas API rasterization of engine-produced SVG → PNG download. PNG menu item enabled in File > Export, tooltip corrected (was "Requires WebGPU renderer").
- **Trigger**: File > Export > PNG
- **ADRs**: 0046 (WebGPU renderer — PNG decoupled), 0047 (navbar export submenu), 0015 (Scene/Model separation)
- **E2E tests**: `export-advanced.spec.ts` (7 tests)
- **Unit tests**: `export-raster.test.ts` (8 tests for `parseSvgDimensions`)
- **Invariant**: Canvas stays untainted — engine SVG has no external refs

### PDF Export via Browser Print API
- **PR**: feat/pdf-export
- **Feature**: Browser-native PDF export via `window.print()` + `@media print` CSS. PDF menu item in File > Export submenu. Print stylesheet hides UI chrome (navbar, sidebar, rail, inspector, hud, bottom-bar), resets canvas transform, sets white background.
- **Trigger**: File > Export > PDF
- **Invariant**: Zero Rust/WASM surface; print consumes live `.viewer` DOM only
- **CSS**: `@media print` block (~45 LOC) in `styles.css:1928-1973`

### Presentation Mode — Native Fullscreen (ADR-0048)
- **PR**: feat/presentation-mode-fullscreen (PR-45)
- **Feature**: Native fullscreen via `requestFullscreen()` API, `fullscreenchange` as single source of truth, `fitToView()` auto-fit on enter, 3s fade exit overlay, graceful fallback when fullscreen denied
- **Trigger**: Ctrl+Shift+P, View > Present menu, F11 (native browser)
- **Exit**: Escape key, browser native exit
- **ADRs**: 0048 (Presentation Mode v2 had "Engine dependency: None" — confirmed)
- **E2E tests**: `tests/e2e/presentation-fullscreen.spec.ts` (8 tests)
- **Invariant**: `isPresentationMode === !!document.fullscreenElement` always holds

### Version History Timeline (ADR-0064, ADR-0065, ADR-0066)
- **PR**: feat/version-history-ui-integration (PR-3)
- **Feature**: IndexedDB persistence, 30s auto-save idle debounce, Zone 2 sidebar panel, restore/delete actions
- **ADRs**: 0064 (snapshot format), 0065 (Zone 2 sidebar placement), 0066 (idb runtime dep)
- **E2E tests**: `tests/e2e/version-history.spec.ts`
- **Unit tests**: `tests/version-store.test.ts`, `tests/auto-save.test.ts`

---

## ⏸️ Deferred (no en plan activo, documentados en ADR-0048)

- Properties dialog (Metadata en DiagramModel)
- Real-time collaboration (CRDT)
- AI assistant (LLM integration)
- Backend / cloud sync (offline-first, ADR-0002)

---

## 📋 ADR Inventory

| ADR | Tema | Fase |
|-----|------|------|
| 0001-0040 | Bootstrap, dominio, compatibilidad, crates | Engine |
| 0041 | Web Shell Toolchain (Vite + Vitest + Playwright) | UI |
| 0042 | Web Shell Editor Surface v1.1 | UI |
| 0043 | commands → format-drawio dep for IdMap | Engine |
| 0044 | Routing Architecture (Data vs Algorithm) | Engine |
| 0045 | Layout Architecture (Sugiyama pipeline) | Engine |
| 0046 | WebGPU Renderer Architecture | Engine |
| 0047 | Web Shell UI v1 — 5-Zone Application Layout | UI |
| 0048 | Deferred Innovations (History, Properties, Presentation) | v2 |
| 0049 | UI Gap Alignment + Slice Plan | UI |
| 0050 | **Edge Creation UX Contract** 🆕 | Phase 0 |
| 0051 | **Connect/Disconnect Commands** 🆕 | Phase 0 |
| 0051 | **Slice-A Icon Strategy** 🆕 | UI |
| 0051 | **Slice-B1 Grid Contrast** 🆕 | UI |
| 0052 | **Shape Catalog** 🆕 | Phase 1 |
| 0052 | **Slice-B2 Rotation Deferral** 🆕 | UI |
| 0053 | **Polygon Generalization** 🆕 | Phase 1 |
| 0054 | **Multi-Selection Model** 🆕 | Phase 2 |
| 0055 | **Copy/Paste Strategy** 🆕 | Phase 2 |
| 0056 | **Inline Text Editing UX** 🆕 | Phase 3 |
| 0057 | **Rotation/Flip Geometry** 🆕 | Phase 4 |
| 0058 | **Layer/Ordering Model** 🆕 | Phase 5 |
| 0059 | **Stencil Format Spec** 🆕 | Phase 6 |
| 0060 | **Snap/Guides/Alignment** 🆕 | Phase 7 |
| 0061 | **Advanced Visual Effects** 🆕 | Phase 8 |
| 0062 | **Stencil Normalization** 🆕 | Phase 6 |
| 0063 | **mxFile Vars/Metadata** 🆕 | Engine |
| 0064 | **Snapshot Format (Draw.io XML Canonical)** 🆕 | UI |
| 0065 | **Version Panel Zone 2 Placement** 🆕 | UI |
| 0066 | **Web Shell First Runtime Dep (IDB)** 🆕 | UI |
| 0067 | **Tree Layout Moen** 🆕 | Algorithm |

## Reglas de Actualización

- Este documento se actualiza al completar cada milestone o cambiar de dirección.
- No duplica rationale de ADRs — solo referencia a ellos.
- El estado "actual" de AGENTS.md referencia aquí.
- `DESIGN.md` es la visión de producto; este ROADMAP es el plan de ejecución.
- **v1.0.0 NO se publica automáticamente.** Será decisión explícita del usuario.
