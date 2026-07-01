# Roadmap — Hodei Diagrams

Estado vivo del proyecto. Actualizar en cada milestone o cambiar de dirección.
Para rationale de decisiones, ver `docs/adr/`.

## Estado Actual

**v0.76.0 — Phase 2 P2-3 completo y renderer strategy cerrada.**
Phase A (scene buffer, v0.72.0) + Phase C (SVG buffer, v0.73.0) + Phase D (3.32× browser validation, v0.74.0) + Phase B (command buffer zero-copy JS→Rust, v0.75.0) + TS postcard decoder (v0.76.0) cierran el ciclo completo zero-copy:
- **WASM→JS**: `readSceneBuffer()` + `PostcardDecoder` (todas las variantes de VisualElement) → typed Scene sin JSON parse
- **JS→WASM**: `flushCommands()` + `postcard::from_bytes<Vec<Command>>` → atomic batch dispatch
- Benchmark: 3.32× en browser para scene reads, ~2% diferencia native (to_domain domina)

**ADR-0076 + ADR-0077:** WebGPU/WebGL full evolution queda diferida. SVG + zero-copy bridge es el path canónico; v0.77 conecta ese path al loop real del editor y cierra paridad draw.io con decisiones pragmáticas y medidas.

E2E Coverage Campaign: **472/472 tests green** (v0.69.0). Zero regressions.

| Crate | Capa | Status |
|-------|------|--------|
| `diagram-core` | Dominio | ✅ |
| `diagram-format-drawio` | Compatibilidad | ✅ |
| `diagram-commands` | Comandos | ✅ (17 commands) |
| `diagram-compat-testkit` | Testing | ✅ |
| `diagram-scene` | Proyección | ✅ (PathElement + endArrow/startArrow) |
| `diagram-render-svg` | Render SVG | ✅ (data-edge-id + arrow markers) |
| `diagram-render-wgpu` | Render WebGPU | ⏸ experimental / deferred by ADR-0076 |
| `diagram-wasm` | WASM Bridge | ✅ (20 exports) |
| `diagram-routing` | Routing | ✅ (engine + bend editing + normalization) |
| `diagram-layout` | Layout | ✅ (5 engines + UI) |
| `web-shell/` | UI (TypeScript) | ✅ viewer + editor |

> **v1.0.0 NO se alcanzará automáticamente.** El release de v1.0.0 será
> decisión del usuario cuando considere que el producto está estable.

---

## ✅ Completed Tracks

### Paridad Funcional (Fases 0-9, v0.9.0–v0.31.0)
Shapes, edges, multi-selection, text editing, rotate/flip, layers, stencils, snap/align, effects, toolbar/menus.

### Layout Engines (v0.28.0–v0.38.0)
Tree (Moen), Organic (FR), Circular, Grid (Hodei-original), Hierarchical (Sugiyama). All wired to Arrange > Layout.

### Edge Routing UI (v0.39.0–v0.43.0, ADR-0072)
Pipeline fix (PathElement + .drawio round-trip + route_all_edges), bend editing (insert/move/remove with orthogonal geometry).

### UI Gap Cerrar (v0.44.0–v0.49.0)
- Group/Ungroup (SetVertexParent command + Arrange menu) — v0.44.0, PR #72
- Edge arrowheads (classic/block/open markers + default endArrow=classic) — v0.45.0, PR #73
- Edge label editing (double-click on edge → text edit overlay) — v0.46.0, PR #74
- Page management UI (add/rename/delete page tabs) — v0.47.0, PR #75
- Curved edge rendering (Catmull-Rom spline) — v0.48.0, PR #76
- Page background color (page background + rendering pipeline) — v0.49.0, PR #77
- Arrowheads at perimeter (fix render offset) — v0.50.0, PR #78
- Context menu (right-click on shapes and edges) — v0.51.0, PR #79
- Port selection (connect from specific shape sides) — v0.52.0, PR #80
- Edge label positioning (draggable label along edge) — v0.53.0, PR #81
- Shape search filter in sidebar — v0.54.0, PR #82
- Ctrl+D duplicate + arrow key nudge — v0.55.0, PR #83
- Zoom keyboard shortcuts (+/-/0) — v0.56.0, PR #83

### Testing Infrastructure (v0.57.0–v0.63.0)
- Smoke tests for all features v0.38-v0.56 (35 E2E tests) — v0.57.0
- Bend editing integration tests (22 tests) — v0.58.0
- Integration tests v0.48-v0.53 + background writer fix — v0.59.0
- Integration tests v0.38-v0.47 + v0.48-v0.53 (44 tests) — v0.60.0
- Unit tests session.ts (41 tests) — v0.61.0
- Unit tests context-menu.ts (8 tests) — v0.62.0
- Regression tracking script + npm commands — v0.63.0, PR #90

### Housekeeping (v0.64.0)
- Clippy + fmt cleanup — `feat/clippy-fmt-cleanup`, 3 commits, 13 files, no behavior change — v0.64.0, PR #97

### Math Typesetting (v0.65.0)
- mxGraphModel round-trip + Page.math_enabled flag — `feat/math-typesetting-v0.65-engine`, 5 commits, MATH-001..005 — PR #98
- PageScene + SVG `<text data-math-id data-latex>` — `feat/math-typesetting-v0.65-surface`, 4 commits, MATH-010..013 + MATH-020..021 — PR #99
- KaTeX HTML overlay + View > Math Mode toggle + insert/edit dialogs + tests — `feat/math-typesetting-v0.65-ui`, 7 commits, MATH-030..034 — PR #100
- Polish: S-1..S-4 of verify report — PR #101
- Snapshot tests + Playwright E2E CI workflow — PR #102
- Typecheck green — PR #103
- UI tests + lint cleanup — PR #104
- Empty canvas bootstrap fix — PR #105
- Visual polish + justfile visual recipes — PR #106
- AddVertex missing fields fix — PR #107
- Select All (Edit menu) — PR #108
- Math Mode + Ctrl+Shift+G sync bugs — PR #109
- Feature coverage pass (7 bugs fixed, 19 tests, 44 e2e assertions) — PR #110
- Extras > Edit XML dialog — PR #111

### Post-v0.65.0 Backlog Cleanup
- Math-rendering E2E selectors fix + math-enabled fixture + snapshot baseline — PR #112
- `StableIdExt` trait (replaces JSON-based `stable_id` on SVG hot path) — PR #113
- MathJax 4 swap lane documentation — PR #114
- Per-cell math toggle migration path documentation — PR #115
- GitHub Actions removal + AGENTS.md §13 local-CI normalization — PR #116
- `insertMathFormula` LaTeX-label bugfix — PR #117
- Math-overlay render fix (handleImport order + KaTeX `$...$` delimiter stripping) + first snapshot baseline — PR #118

### E2E Coverage Audit (2026-06-27)
- Feature audit + gap analysis vs draw.io + plan with prioritized cycles — `sddk/feature-audit-2026-06/`
- ADR-0075: E2E test strategy — visual evidence required for new tests
- Cycle 1: Replace absolute fixture paths (BLOCKER — 325 pre-existing failures) — DONE (PR #119, 45 specs migrated, `tests/e2e/fixtures.ts` helper)
- Cycle 2: Edge arrowheads + perimeter fix E2E + screenshot — DONE (PR #120, ARROW-001..005, 5 fixtures + 5 screenshots in gitignored snapshots dir)
- Cycle 3: Curved edge rendering E2E + screenshot — DONE (PR #121, CURVED-001..002)
- Cycle 4: Edge label positioning (drag) E2E + screenshot — DONE (PR #122, LABEL-001..002; drag UI not yet exposed so drag-to-reposition deferred)
- Cycle 5: Edit XML dialog (PR #111) E2E + screenshot — DONE (PR #123, EXML-001..003)
- Cycle 6: Layers (z-order panel) E2E + screenshot — DONE (PR #124, ZORDER-001..002)
  - **Bug fixed**: WASM `execute_transaction` glue was discarding z-order payloads (treating them as no-ops). Cycle 6 E2E caught this where unit tests couldn't. Added missing `Transaction::bring_to_front` / `send_to_back` / `bring_forward` / `send_backward` builder methods + Rust integration regression tests.
- ADR-0075 + `.gitignore` updated: Playwright screenshot PNGs are gitignored (local validation only). Text/HTML snapshots still committed (diff cleanly).

### E2E Coverage Campaign — Closing Pre-existing Failures (2026-06-29→)
- **Mission shift**: from "claim draw.io parity" to "verify draw.io parity end-to-end". Each pre-existing E2E failure gets its own SDDK cycle (propose → spec → tasks → apply → verify → archive → release).
- **Cycle 7 (Batch 1):** edge-creation.spec.ts — 6/12 → 12/12 — DONE (PR #125, `fix/edge-creation-e2e-v0.66`, v0.66.0 tag)
  - **Product bug fixed**: connect-mode FSM eagerly registered `pointerup` listener on source click, causing single-click atomic events to cancel in-progress source selection before user could click target. Click-to-connect (the common "click two shapes to wire them" UX) was broken in production, not just in tests. Fix: defer `pointerup` registration until `pointermove` exceeds 5px threshold. Drag-to-anchor still works.
  - **Side benefit**: preview line now appears immediately on first click (matches draw.io), no longer requires active drag.
  - **Test-stale fixes**: edge selector updated from `svg > line[fill="none"]` (matched UI icon SVGs) to `svg [data-edge-id]` (engine-only attribute set by Rust renderer). Test 6 made line/path flexible (new edges with waypoints render as `<path>` not `<line>`).
- **Cycle 10 (Batch 4):** undo-redo-advanced.spec.ts — 5/6 + 1 fixme — DONE (PR #127, `fix/undo-redo-v0.68`, v0.68.0 tag)
  - **Product bug surfaced (initially)**: `engine.undo()` mutates the model store correctly (ChangeStylePayload::undo restores prev_style_id, remove_style()), BUT the test reported `fill = #ff0000` after undo — appeared as engine undo not invalidating render.
  - **Investigation tried 3 paths**: button click, `__hodeiDebug.getSession().undo()`, dispatched KeyboardEvent. All reproduced — initially confirmed as product bug.

### Cycle 11 (Batch 5): undo-redo-advanced.spec.ts — phantom bug closed — DONE (PR #128, `fix/undo-render-replay-v0.69`, v0.69.0 tag)
- **Outcome**: BUG-001 was a phantom (test-stale, not product bug).
- **Root cause**: `fillInput.evaluate(...).dispatchEvent('input')` skips `<input type="color">`'s `change` event and color-picker-closed lifecycle. The inspector's `getChanges()` snapshots default HTMLInput values (`strokeColor: "#ffffff"`, etc.) that don't match the model's actual state. On undo, that mismatch caused the SVG to display inconsistent values.
- **Investigation that proved it**:
  1. Pure Rust `Transaction::commit(editor)` + `editor.undo()` correctly restores `vertex.style_id = None` (cargo test passes).
  2. `__hodeiDebug.fetchSceneFresh()` — bypasses editor cache, queries live engine, shows `fill_color: null` after undo.
  3. `page.locator('[data-testid="inspector-fill-hex"]').fill('#ff0000')` — Playwright `fill()` simulates real browser events, undo reverts correctly.
- **Resolution**: Replaced `evaluate(...)` flow with `Playwright fill()` on the free-form hex input. Test 1 unfixme-ed, suite 6/6.
- **Diagnostic surface kept**: `Session.fetchSceneJson` + `__hodeiDebug.fetchSceneFresh` for future cache-vs-engine divergence investigations.
- **Lesson**: `<input type="color">` requires `change` event, not `input`. Use free-form text inputs or hex fields for reliable test automation.

### Cycle 12+ (Backlog): remaining E2E gaps — CLOSED
After v0.69.0, the remaining backlog was triaged in aggregate:

- **viewer.spec.ts**: 6/6 ✅
- **canvas-zoom-pan.spec.ts**: 8/8 + 1 skipped (pan-on-page-switch is by-design) ✅
- **version-history.spec.ts**: 5/5 ✅
- **ui-density.spec.ts**: 32/32 ✅
- **ui-layout.spec.ts**: 9/9 ✅
- **ui-platform.spec.ts**: 13/13 + 2 skipped (icon-image + export-enabled intentional) ✅
- **ui-presence.spec.ts**: 25/25 ✅
- **navigation-session.spec.ts**: 5/5 + 1 skipped (Properties persistence by-design) ✅
- **visual-regression.spec.ts**: 3/3 ✅
- **inspector-style / -effects-gradient / -effects-shadow / -effects-glass**: 12+9+4+6 = 31/31 ✅

**Campaign final result**: 472/472 E2E tests green (excluding 8 intentional skips documented in their test bodies). Zero regression across the audit period.

### Phase 2 — Zero-Copy WASM Bridge (v0.70.0–v0.77.0)
- v0.70.0: perf-baseline spec captured
- v0.71.0: N=20 native bench — engine 6× faster natively than in browser
- v0.72.0: Phase A (scene buffer, Rust→JS zero-copy, 3.8× native speedup)
- v0.73.0: Phase C (SVG buffer, Rust→JS zero-copy, native parity)
- v0.74.0: Phase D (browser validation — 3.32× confirmed in browser)
- v0.75.0: Phase B (command buffer JS→Rust, `flush_commands` + `execute_batch` atomic)
- v0.76.0: TS postcard decoder (`PostcardDecoder` — 17 VisualElement variants, typed Scene read)
- v0.77.0: **P0 + P1 + P2 + P3 + P4 complete** (2026-06-29, `a21155c` + `3620a15` + `8bf2e74` + `95b48fb` + `ec9a4d6`) — split scene decode + wire zero-copy into refresh paths + SVG cache invalidation + Copy as SVG wired + scale evidence. P5 complete (see Cycle 13-18 below).
- v0.78.0 – v0.83.0: Cycles 13–18 (2026-06-30, in-progress hardening — see [Cycle 13-18 Closeout](#cycle-13-18-closeout-2026-06-30))
  - v0.78.0: LayoutConfig serde default + menu error propagation
  - v0.79.0: error propagation batch #2 (route + bend + applyXXX)
  - v0.80.0: error-path E2E coverage
  - v0.81.0: keydown dedup + page-tab refresh (visual-flows F4/F5/F6/F10)
  - v0.82.0: visual-flows promoted to canonical suite
  - v0.83.0: 49 specs migrated from networkidle → waitForAppReady (~4× speedup)

Next phase: opportunistic maintenance (cycle-driven) — no active milestone

### Test counts (post-cycle-18, 2026-06-30)
- Rust: ~700+ unit/integration tests, all passing (`just verify` clean)
- Web-shell: 202 unit tests passing
- E2E: 478/478 green ✅ (focused suites + visual-flows promoted in cycle 17, 8 intentional skips). Runtime ~56s.
  - Smoke tests (39 tests, v0.38-v0.56 coverage) removed in cycle 13 — redundant with focused suites.
  - Cycle 18 standardized on `waitForAppReady(page)` helper across 49 legacy specs that were on `goto + networkidle` (ADR-0075 anti-pattern).

### Tier 1-3 closures landed in this batch (also shipped before v0.64.0)
- Image import (style-driven `ShapeKind::Image` + SVG rendering) — PR #93
- Stencil libraries (FillStroke/Fill/Stroke element parsing + diagnostics) — PR #94
- Connection Points Phase A (style-driven via `Anchor` enum) — PR #91
- Connection Points Phase B (TS port-handles overlay + WASM anchor commands) — PR #95
- More stencil libraries (TS UI: dynamic loading via file picker) — PR #96
- Swimlanes Phase 1 + 2 (Group.parent + SwimlaneHeader + SVG rendering) — PR #92

---

## 🎯 Active Track: v0.77.0 — Pragmatic performance + draw.io parity closure

Decision: **do not pursue WebGPU/WebGL full parity now** (ADR-0076). Close the next milestone by improving the proven SVG + Rust/WASM path (ADR-0077).

The next work stays on the proven path:

- SVG renderer as canonical visual output
- Rust engine commands as source of truth
- WASM zero-copy bridge where benchmarks prove value
- E2E visual evidence for user-facing parity

### v0.77 plan

| Phase | Focus | Exit gate | Status |
|-------|-------|-----------|--------|
| P0 | Split scene postcard decode from SVG rendering | fair JSON scene vs postcard scene browser measurement | ✅ Complete (2026-06-29, `a21155c`) |
| P1 | Wire active-page SVG buffer into product refresh paths | common active-page refreshes avoid `renderAllPages()` where safe | ✅ Complete (2026-06-29, `3620a15`) |
| P2 | Add active-page SVG cache + invalidation | import, command, undo/redo, and page changes cannot produce stale SVG | ✅ Complete (2026-06-29, `8bf2e74`) |
| P3 | Pragmatic draw.io parity polish | Copy/export SVG and unsupported menu behavior are honest and tested | ✅ Complete (2026-06-29, `95b48fb`) |
| P4 | Add 1k/5k/10k synthetic performance evidence | browser timings recorded — SVG/DOM viable to 10k shapes (26ms render) | ✅ Complete (2026-06-29, `ec9a4d6`) |
| P5 | Hardening | `just verify`, `just web-typecheck`, and focused Playwright suites pass | ✅ Complete (2026-06-30) |

**P5 Notes:**
- `just verify` ✅ Rust tests clean
- `just web-typecheck` ✅ TypeScript clean
- `just web-wasm` ✅ WASM rebuilt
- Focused Playwright suites: 470/470 at P5 closeout; grew to 478 by cycle 18.
- **Smoke tests removed**: `smoke/v0_38_to_v0_45.spec.ts` (13 tests) + `smoke/v0_46_to_v0_56.spec.ts` (26 tests) — coverage redundant with focused suites or uncovered gaps better served by unit tests.

### Cycle 13-18 Closeout (2026-06-30)

Six follow-up cycles against the v0.77.x branch, each shipped as a separate tag:

- **Cycle 13 — P5 hardening (v0.78.0)** PR #141. Grill session surfaced that the smoke-test failures had a single root cause.
  - **Bug A (real)**: `LayoutConfig` required `direction`, `intra_cell_spacing`, `inter_rank_spacing`, `max_iterations` without `#[serde(default)]`. JS sends `{}`, WASM rejects, error swallowed by `editor.applyLayout()` returning `void`. Fix: `#[serde(default)]` on the struct.
  - **Bug B/C (phantom)**: Group and Group/Ungroup smoke tests used `data-group-id` selector that never existed; with Bug A fixed, group wraps selected vertices in `<g clip-path>`.
  - **Cycle 13 gap**: `editor.applyLayout()` now returns `Result<void, EngineError>`; menu handlers feed failures into `ui.setDiagnostics('error', ...)`. ADR-0078 records the convention.
  - **Docs**: `CONTEXT.md` adds `GridLayout`, `HierarchicalLayout`, `LayoutDirection`, `LayoutConfig`; flagged ambiguity added for menu-failure-visibility.

- **Cycle 14 — error propagation batch (v0.79.0)** PR #142. Extends the ADR-0078 pattern to 9 more editor methods + 1 menu handler.
  - `routeAllEdges`, `insertBend`, `moveBend`, `removeBend`: now return `Result<void, EngineError>` with `#onError` funnel.
  - 5 `applyXXXToSelection` methods: switched from `this.#session.executeTransaction` (silently-discarded Result) to `this.executeTransaction` (already handles Result).
  - Re-route Edges menu: branches on Result and routes failures via `ui.setDiagnostics`.

- **Cycle 15 — error-path tests (v0.80.0)** PR #143. Closes the cycle 13 PR-description promise to add error-path tests.
  - 4 tests in `error-path.spec.ts`: invalid kind, routeAllEdges no-op, insertBend invalid id, end-to-end menu surface.
  - `__hodeiDebug.getEditor()` exposed for direct Result assertion.
  - `[data-testid="error-message"]` set on diagnostics span so the selector resolves.
  - `just web-typecheck` ✅; 478/478 suites green.

- **Cycle 16 — visual-flows keydown + page-tab refresh (v0.81.0)** PR #144. 4 pre-existing F4/F5/F6/F10 visual-flows failures.
  - **Root cause A**: `main.ts:660` and `editor.ts:1153` both registered keydown listeners on document — single Ctrl+Z fired `undoCmd` twice, undoing the user's add AND the initial page-setup entry (engine 2 → 0 instead of 2 → 1).
  - **Root cause B**: no page-tab refresh on undo; engine state decremented but DOM stayed stale.
  - **Root cause C (tests)**: Playwright `.click()` on an SVG `<rect>` doesn't reach `pointerdown`; `<details>` menu items need `summary` click + hover.
  - Fix: split keydown responsibilities (main.ts = app-level, editor.ts = editor-level); add `refreshPageTabs()` to `setOnStateChange`.

- **Cycle 17 — visual-flows promoted (v0.82.0)** PR #145. The visual-flows spec was authoritative only on the developer who owned the gitignored `_verify/` directory. Promoted to canonical suite.
  - Move `tests/e2e/_verify/visual-flows.spec.ts` → `tests/e2e/visual-flows.spec.ts`.
  - Refactor `.gitignore` from blanket-exclude `_verify/` to explicit patterns per category of scratch/debug.
  - Add `tests/e2e/screenshots/` to `.gitignore` (PNG outputs are local validation, not test fixtures).

- **Cycle 18 — networkidle → waitForAppReady (v0.83.0)** PR #146. Standardizes the e2e suite per ADR-0075.
  - 49 legacy specs, 314 occurrences of the flaky `goto + networkidle` pattern replaced.
  - 3 files retain `networkidle` on mid-test `page.reload()` waits — different pattern, kept on purpose.
  - **Performance bonus**: full-suite runtime drops from 1.1m → 56s (~4×).

Planning artifacts:

- `docs/adr/0077-pragmatic-performance-and-drawio-parity.md`
- `sddk/pragmatic-parity-performance-v0.77/proposal.md`
- `sddk/pragmatic-parity-performance-v0.77/spec.md`
- `sddk/pragmatic-parity-performance-v0.77/tasks.md`

WebGPU/WebGL may be reopened only with measured evidence that SVG/DOM is the bottleneck on 1k/5k/10k-shape fixtures.

## 🎯 Active Track: Interaction Parity Campaign (2026-07-01)

**Strategy**: Close UX/behavior gaps vs draw.io using measured evidence and ADR-driven decisions.

### Milestones Delivered (Merged to main)

- **IP-A (Pan/Zoom)**: `feat/interaction-parity-pan-zoom` (PR #154).
  - Plain wheel = vertical pan, `Shift+wheel` = horizontal pan, `Ctrl/Cmd+wheel` = zoom.
  - `Space+drag` pan, right-click drag pan, `Home` reset view.
  - E2E: `tests/e2e/navigation-modifiers.spec.ts`.
- **IP-B (Selection Modifiers)**: `feat/interaction-parity-selection-modifiers` (PR #155).
  - `Alt+drag` force selection box, `Alt+Shift+drag` deselect box, `Alt+click` cycle z-stack.
  - `Tab`/`Shift+Tab` cycle selection, `Ctrl+Shift+A` deselect all.
  - `Ctrl+E` select connectors, `Ctrl+I` select shapes.
  - E2E: `tests/e2e/selection-modifiers.spec.ts`.
- **IP-C (Connector Style)**: `feat/interaction-parity-ip-c-connector-style` (PR #156).
  - Style clipboard (`Alt+C`/`Alt+V`), default style editor cache.
  - `clearAllWaypoints()` + `Alt+Shift+R`.
  - Connector context menu (Add/Remove Waypoint), shape library modifier routing.
  - E2E: `style-shortcuts.spec.ts`, `shape-library-modifiers.spec.ts`, `connector-modifiers.spec.ts`.
- **IP-D (Binding & Context)**: `feat/interaction-parity-ip-d-binding-context` (PR #157).
  - Resolved keyboard collisions: `Ctrl+G` (Group), `Ctrl+Shift+U` (Ungroup), Grid (menu only).
  - Page tab context menu (Rename, Duplicate, Move Left/Right, Delete).
  - Shape/Edge context menu extensions (Edit Link, Lock/Unlock).
  - E2E: `binding-collision.spec.ts`, `page-tab-menu.spec.ts`, `context-menu-extended.spec.ts`.
- **IP-E (Engine Gaps)**: `feat/interaction-parity-ip-e-engine` (PR #158, reduced scope).
  - Engine: `DiagramModel.default_style`, `SetDefaultStylePayload`, `ReverseEdgePayload`, `FlipEdgePayload`.
  - `DuplicatePage`/`ReorderPage` scaffolds (NotImplemented).
  - TS wiring for style cache and edge reverse/flip.
  - E2E: `tests/e2e/engine-gaps.spec.ts`.
- **Housekeeping**: `housekeeping/impeccable-and-p3-fixes` (PR #159).
  - HUD semantic hierarchy, responsive breakpoints, focus-visible.
  - Fixed UI platform / connector modifiers specs.
  - `Cargo.lock` formatting.
- **IP-D/IP-E Follow-up (DuplicatePage + ReorderPage)**: `feat/interaction-parity-ip-de-followup` (PR #160).
  - Status: Merged.
  - Rust: `DuplicatePagePayload` (full impl, undo cascade), `ReorderPagePayload` (full impl, `page_order` model support).
  - TS: `Editor.duplicateActivePage()` and `moveActivePage()` wired to engine commands.
  - Scene: `SceneBuilder` uses `model.pages_in_order()` to reflect `page_order` in render.
  - Verification: `just verify` ✅, full Playwright 514 pass (4 pre-existing failures).
  - Archive: `sddk/interaction-parity-ip-de-followup-duplicate-reorder/archive-report.md`.

### Next Steps

- **Recent closeout**: 4 pre-existing Playwright failures were fixed (HUD labels + future categories visibility). Visual suites now show 70/72 passing with 2 intentional skips.
- **IP-F (Layer Model)** is the next implementation milestone.
  - Scope: full `diagram-core` layer model (ZOrder, LayerId), layer panel UI, export/import.
  - Rationale: largest remaining interaction gap; deferred by ADR-0081 and now promoted as the next cycle.

### Strategy Artifacts

- `docs/adr/0079-drawio-interaction-parity-strategy.md`
- `docs/adr/0080-keyboard-shortcut-collision-resolution.md`
- `docs/adr/0081-layer-model-gap-deferred.md`
- `docs/drawio-user-interaction-workflows.md`

## 🎯 Original: draw.io Parity Completa (CLOSED)

Análisis exhaustivo de features restantes, ordenadas por impacto:

### Tier 1 — Core (destraba uso diario)

| Feature | Estado | Scope | Esfuerzo |
|---------|--------|-------|----------|
| **More stencil libraries** | ✅ Dynamic loading via file picker | TS loading | Bajo | PR #96 |

### Tier 2 — Polish (mejora UX)

| Feature | Estado | Scope | Esfuerzo |
|---------|--------|-------|----------|
| **Image import** | ✅ ShapeKind::Image + SVG rendering | Engine + TS | Medio | PR #93 |
| **Math typesetting** | ✅ KaTeX HTML overlay over `<text data-math-id data-latex>`, lazy-loaded, View>Math Mode toggle | Engine + TS + KaTeX | Alto | PR #98, #99, #100 |

### Tier 3 — Avanzado

| Feature | Estado | Scope | Esfuerzo |
|---------|--------|-------|----------|
| **Swimlanes** | ✅ Group.parent + SwimlaneHeader + SVG rendering | Engine + TS | Alto | PR #92 |
| **Connection points** | ✅ Phase A (Anchor enum) + Phase B (TS port-handles overlay) | Engine + TS | Alto | PR #91, #95 |

---

## ⏸️ Deferred (ADR-0048)

- Real-time collaboration (CRDT)
- AI assistant (LLM integration)
- Backend / cloud sync (offline-first, ADR-0002)

---

## 📋 ADR Inventory

| ADR | Tema | Fase |
|-----|------|------|
| 0001-0040 | Bootstrap, dominio, compatibilidad, crates | Engine |
| 0041-0049 | Web Shell toolchain, UI layout, gap plan | UI |
| 0050-0062 | UI Gap phases 0-8 (edges, shapes, selection, text, rotate, layers, stencils, snap, effects) | UI |
| 0063-0066 | mxFile vars, version history (snapshot, panel, IDB) | UI |
| 0067-0070 | Layout engines (Tree Moen, Organic FR, Circular, Grid) | Algorithm |
| 0071 | Rect.origin Top-Left Convention | Engine |
| 0072 | Edge Routing UI v1 — Orthogonal Bend Editing | Routing |
| 0073 | Phase 2 Performance Methodology — perf-baseline spec | Perf |
| 0074 | Zero-Copy WASM Bridge Design (scene/SVG/command buffers + postcard) | Perf |
| 0075 | E2E Test Strategy — visual evidence required | Testing |
| 0076 | Defer WebGPU/WebGL Evolution as Primary Renderer | Rendering |
| 0077 | Pragmatic Performance and Draw.io Parity Closure | Perf / Rendering |
| 0078 | Error Path Visibility Convention | UI |
| 0079 | Draw.io Interaction Parity Strategy | UX / Interaction |
| 0080 | Keyboard Shortcut Collision Resolution | UX / Interaction |
| 0081 | Layer Model Gap Deferred | UX / Interaction |

## Reglas de Actualización

- Este documento se actualiza al completar cada milestone o cambiar de dirección.
- **v1.0.0 NO se publica automáticamente.** Será decisión explícita del usuario.
