# Roadmap — Hodei Diagrams

Estado vivo del proyecto. Actualizar en cada milestone o cambiar de dirección.
Para rationale de decisiones, ver `docs/adr/`.

## Estado Actual

**v0.112.0 — Workbench redesign (R1a→R1b→R1c→R2a→R2b→R2c→R2d→R3) shipped. Mobile responsive drawers + HUD density + navbar toolbar + sidebar rail + history panel.**

El workbench rediseñado cubre:
- R1a: Controller foundation (`EditorState`, `DensityContext`, event bus, `waitForAppReady`)
- R1b: Sidebar rail + main layout restructuring
- R1c: History panel + CSS E2E stabilization
- R2a: Navbar toolbar — 44px single-row, contextual density
- R2b: InteractionState seam — `DisposableSet` listener, `resolveSelection` bridge
- R2c: HUD density migration — CSS-driven density items, `hud-geometry`, toolbar `hud-mode` alias
- R2d: Bottom-left cluster — remove full-width grid, bottom bar
- R3: Responsive drawer system — mobile slide-in drawers with focus trap, Escape, outside-click, aria-modal/role=dialog, `prefers-reduced-motion`

**v0.111.0 — BendHandlesOverlay extraction + clientToDoc dedup (v0.109.0), port-handles DragSession (v0.108.0), transform handles structural cleanup (v0.107.0, v0.106.0).**
- **Bug crítico del usuario** (post-v0.104.0): drag, inspector position, y resize handles silenciosamente no hacían nada porque `MoveVertex` payload omitía `rotation/flip_h/flip_v`. La E2E suite pasaba por la razón equivocada (no verificaba que la x cambiara).
- Fix: `#findOriginalGeometry` ahora devuelve la geometría completa; `#buildMoveVertexCmd` y la facade `setVertexGeometry` propagan los 8 campos. Regression test `tests/e2e/move-vertex-rotation.spec.ts` que sí verifica el cambio de x.
- La rotación por Ctrl+R / Shift+R / H / V ya funcionaba (usa `RotateVertex` payload, no `MoveVertex`).
- IP-G épica cerrada: `SelectionTarget = Vertex | Group | Edge` propiedad del engine, bridge WASM con `{idx, version}`, shell adapter para SEL-015/016 drill-down + Alt-bypass, edge prefiere vertex en conectores (draw.io convention).
- Slices de la épica: 1 (typed model, v0.93.0) + 2 (engine commands, v0.94.0) + 3 (WASM contract + shell adapter, v0.95.0) + 4 (E2E parity + selection drill-down estable, v0.100.0).
- 540/540 Playwright E2E pass, 13 skipped (pre-existing), 0 failed.

**Próxima pista (en inspección):** Cerrar el gap roster de `IP Gaps Restantes (~100 workflows)`. Después: stencil coverage, conflict resolution, presentation polish.

E2E Coverage Campaign: **540/540 tests green** (v0.100.0). Zero regressions.

| Crate | Capa | Status |
|-------|------|--------|
| `diagram-core` | Dominio | ✅ |
| `diagram-format-drawio` | Compatibilidad | ✅ |
| `diagram-commands` | Comandos | ✅ (17 commands) |
| `diagram-compat-testkit` | Testing | ✅ |
| `diagram-scene` | Proyección | ✅ (PathElement + endArrow/startArrow) |
| `diagram-render-svg` | Render SVG | ✅ (data-vertex-id / data-group-id / data-edge-id) |
| `diagram-render-wgpu` | Render WebGPU | ⏸ experimental / deferred by ADR-0076 |
| `diagram-wasm` | WASM Bridge | ✅ (24 exports — Slice 3 added selection commands) |
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

## 🎯 Active Track: Gaps Restantes — Post-IP-G (2026-07-03)

**Strategy**: With the Interaction Parity Campaign A–G fully closed in v0.100.0, the next
focus is the residual draw.io UX gaps that didn't fit any IP slice (~100 workflows).
Triage by frequency of use and test cost; aim for batches of 10–20 specs per release.

### Milestones Delivered (Merged to main)

**Interaction Parity Campaign (closed in v0.100.0, `IP-A → IP-G`)**

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

- **IP-B Quality Polish (selection-reconciliation)**: `feat/selection-reconciliation-quality-polish`.
  - Status: Ready for PR merge.
  - 3 draw.io parity corrections: marquee containment default (Alt=intersection), Tab includes edges, Alt+click no-wrap.
  - Catalog reconciliation: SEL-004/006/009/010/011/012/014 → ✅.
  - Verification: PASS WITH WARNINGS (W-1: AC-5a placeholder, W-2: AABB unit test suggestion).
  - Archive: Engram `sddk/selection-reconciliation-quality-polish/archive-report`.

- **IP-F (Layer Model)**: `feat/ip-f-layer-*` (PRs #161-#166, v0.91.0).
  - Engine: `LayerId` newtype, `Layer` struct, `ModelStore.layers` slotmap, denormalized `layer_id` on Vertex/Edge/Group.
  - Commands: `AddLayer`, `RemoveLayer`, `RenameLayer`, `SetLayerVisible`, `SetLayerLocked`, `MoveShapeToLayer` + undo/redo.
   - Drawio: Layer cells parse/emit + transitive parent-chain resolution.
  - Scene: `SceneBuilder` filters hidden layers.
  - Web-shell: Layers panel + minimum viable layer workflows E2E.
  - Doc reconciliation: Updated workflows catalog, ROADMAP, ADR-0081 footer.
- **IP-G (Selection v2 — Engine-Owned Typed Selection)**: `selection-v2-engine-owned` (PRs #170, #171, #172, #179 — all 4 slices merged, v0.100.0).
  - Slices: 1 (v0.93.0 #170 typed model) + 2 (v0.94.0 #171 engine `SelectionService`) + 3 (v0.95.0 #172 WASM boundary + Web Shell adapter) + 4 (v0.100.0 #179 E2E parity + viewBox fix + edge-prefers-vertex + stencil manager refactor).
  - Scope: Typed `SelectionTarget = Vertex | Group | Edge` owned by Diagram Engine; WASM boundary contract (`resolve_selection` / `select_target` / `get_selection` / `clear_selection`); Web Shell adapter replacing PR #169 partial behavior.
  - ADR: ADR-0082 (engine-owned typed selection semantics) — **RESOLVED**.
  - Closing fixes in v0.100.0:
    - SelectionTarget serde uses `{idx, version}` SlotmapId format (slice 3).
    - Web Shell dispatches per target type: `data-vertex-id` / `data-group-id` / `data-edge-id`.
    - `Editor.#clientToDoc` accounts for non-zero SVG `viewBox` origins.
    - `SelectionService::resolve` defers edges to non-edge hits at connector endpoints so plain click + Alt+click select the vertex (draw.io convention).
    - `Editor.#onPointerDown` defers to engine when DOM hit-test finds only an edge endpoint.
    - `StencilLibraryManager` registers via `DiagramEngineSession.setStencilLibrary` (eliminates latent stale-handle risk when first handle was 0).
  - Release: tagged `v0.100.0` (annotated) + GitHub release notes.

- **MOVE-013 (Post-IP-G Gap — Keyboard resize via Ctrl+Shift+Arrow)**: `feat/move-013-keyboard-resize` (PR #182, v0.101.0).
  - Editor: new `Ctrl+Shift+Arrow` branch in `#onKeyDown` + `#resizeSelection(dw, dh)` sibling to `#nudgeSelection`.
  - Behavior: Left/Right adjusts width, Up/Down adjusts height, ±1 user-unit per press. Multi-selection resizes each shape as a single atomic MoveVertex transaction.
  - Snap: when grid snap is enabled, the shape's origin (x, y) snaps to the nearest grid line so the shape stays anchored at its top-left corner (draw.io parity).
  - Latent fix in passing: `#nudgeSelection` now sends a complete `CellGeometry` (rotation, flip_h, flip_v), restoring MoveVertex reliability on selections with accumulated transforms.
  - E2E: `tests/e2e/move-resize-modifiers.spec.ts` (MOVE-prefix suite, 5 cases).
  - Release: tagged `v0.101.0` (annotated) + GitHub release notes.
- **MOVE-003 + MOVE-004 (Post-IP-G Gap — Grid nudge + Alt bypass)**: `feat/move-003-004-grid-nudge-and-alt-bypass` (PR #185, v0.102.0).
  - **MOVE-003**: Shift+Arrow lands each selected shape's top-left on the next grid line in the direction of motion (per-shape, GRID_SIZE = 20). No-op when snap is off.
  - **MOVE-004**: hold Alt during nudge or Ctrl+Shift+Arrow resize to bypass `#snapToGrid` for that operation — useful for fine placements across grid lines.
  - Editor: `#nudgeSelection` and `#resizeSelection` accept opts `{shiftToGrid, ignoreSnap}`; new shared helper `#nextGridCoord(current, dir, shiftToGrid, ignoreSnap)`.
  - E2E: 4 new specs in `tests/e2e/move-resize-modifiers.spec.ts` under the MOVE-003/004 describe block.
  - Release: tagged `v0.102.0` (annotated) + GitHub release notes.
- **SEL-005 (Post-IP-G Gap — Marquee selection mode)**: `fix/sel-005-marquee-mode-contain-intersect` (PR #187, v0.103.0).
  - Editor: `MarqueeState.containment: 'contain' | 'intersect'` so the active mode is part of the FSM state.
  - `#startMarquee(x, y, intent, containment)` with the new containment param; defaults to contain (draw.io convention).
  - `#endMarquee` dispatches `#applySelectInRect` / `#applyDeselectInRect` with the captured mode.
  - New helper `#getContainingIds` shares a `mode` switch with `#getIntersectingIds` via `#collectIdsInRect`.
  - `#onPointerDown` routes by modifier: Shift=contain, Alt=intersect, Alt+Shift=deselect+intersect.
  - Public `selectInRect` / `deselectInRect` preserved as thin wrappers (intersect default) so the existing SEL-006 regression test still passes.
  - Engine refactor (`#collectIdsInRect`) split the mode switch in the prior commit; this commit just threads it through the editor's public methods.
  - 4 new unit tests in `selection_service.rs` (prefer vertex over edge at endpoint; click on edge alone still returns edge; alt+click branch covers).
  - E2E spec for SEL-005: TODO (engine-side behavior is unit-tested; authoring a robust E2E for the multi-modifier dispatch is deferred).
  - Release: tagged `v0.103.0` (annotated) + GitHub release notes.
- **MoveVertex payload missing rotation (v0.105.0 critical fix)**: PR #191 `fix/movevertex-rotation-fix`.
  - User reported: shape creation / move / resize / rotate not working.
  - Rotation was a red herring (Ctrl+R / H / V use `RotateVertex` and already worked). The actual bug: `MoveVertex` JSON omitted `rotation / flip_h / flip_v`, so the engine's `CellGeometry` deserializer rejected the command with `InvalidCommand: missing field \`rotation\`` and the action was silently dropped.
  - Fix: `#findOriginalGeometry` returns the full geometry (8 fields); `#buildMoveVertexCmd` and `#setVertexGeometry` propagate the full set; 5 internal call sites spread rotation/flip/relative from `orig`.
  - E2E: new regression `tests/e2e/move-vertex-rotation.spec.ts` (1 spec) verifies that drag actually changes the data-vertex-id x attribute. The existing drag test only verified the SVG is still visible, so it was passing for the wrong reason.

- **MOVE-016 (Post-IP-G Gap — Insert-space / move-area)**: `fix/move-016-insert-space-drag` (PR #189, v0.104.0).
  - Alt+Ctrl+Shift+drag in empty area → translate all shapes whose bounds intersect the swept rect by the drag delta on release.
  - Editor: new `MoveAreaState` FSM state; `#startMoveArea` / `#updateMoveArea` / `#endMoveArea` methods; `#onPointerDown` routes by modifier; `#onPointerUp` commits a single MoveVertex transaction.
  - Snap is intentionally NOT applied — the user explicitly asked to push shapes out of the way.
  - E2E: 1 new spec in `tests/e2e/move-resize-modifiers-move-016.spec.ts` continuing the move-resize-modifiers family.
  - Release: tagged `v0.104.0` (annotated) + GitHub release notes.

### Workbench Redesign (v0.106.0–v0.111.0, R1a→R3)

Complete UI restructuring from the 2026-07-xx workbench epic. All slices merged via trunk-based SDDK.

- **v0.106.0 — Transform handles structural cleanup**: `refactor/transform-handles-r106` (PR #193, #194).
  - 12 structural findings resolved; `SHAPE_KEYS` now includes `'Group'` (single-selected Groups render 8 resize + 1 rotation handle)
  - 3 new modules: `dom-drag.ts` (DragSession<T> pointer lifecycle), `scene-bounds.ts` (canonical SHAPE_KEYS + sceneBounds + sceneGeometry), OverlayHitZone registry on `Editor`
  - 21 atomic commits on `refactor/transform-handles-r107`
- **v0.107.0 — Transform handles structural cleanup (r107 follow-up)**: `refactor/transform-handles-r107` (PR #195, #196, #197).
  - `port-handles.ts` DragSession<T> migration; OverlayHost OCP refactor; `clientToDoc` dedup
- **v0.108.0 — BendHandlesOverlay extraction + clientToDoc dedup**: `refactor/bend-handles-extraction-and-client-to-doc-r109` (PR #197).
- **v0.109.0 — Engine bend support (perimeter-inclusive PathElement)**: `feat/engine-bend-support-r110` (PR #198, #200). ADR-0083 added.
- **v0.110.0 — Port-handles DragSession + OverlayHost OCP**: `refactor/port-handles-drag-session-and-overlay-ocp-r108` (PR #196).
- **v0.111.0 — Workbench redesign (R3 responsive drawers)**: PRs #202/#204/#206/#208/#210/#212/#214/#216.
  - R1a: Controller foundation (`EditorState`, `DensityContext`, event bus, `waitForAppReady`) — PR #202
  - R1b: Sidebar rail + main layout restructuring — PR #204
  - R1c: History panel + CSS E2E stabilization — PR #206
  - R2a: Navbar toolbar — 44px single-row, contextual density — PR #208
  - R2b: InteractionState seam — `DisposableSet` listener, `resolveSelection` bridge — PR #210
  - R2c: HUD density migration — CSS-driven density items, `hud-geometry`, toolbar `hud-mode` alias — PR #212
  - R2d: Bottom-left cluster — remove full-width grid, bottom bar — PR #214
  - R3: Responsive drawer system — mobile slide-in drawers with focus trap, Escape, outside-click, aria-modal/role=dialog, `prefers-reduced-motion` via CSS — PR #216 (feat/workbench-r3-responsive-drawers)

### In Progress

**Infinite Canvas Phase 3** — perf polish: zoom snap + FrameBudgetMonitor + WASM memory HUD (v0.115.0) — branch `feat/infinite-canvas-phase3-perf-polish` ✅

## 🎯 Recently Closed Tracks

### Replay Coalescing + Paste Atomicity (v0.116.0) — `feat/replay-coalescing`

**Problem**: `triggerReplay()` (≈57 call sites) ran render synchronously; rapid sequences of engine mutations (e.g., 50 paste ops) produced 50 consecutive renders, each ~8ms on the main thread.

**Solution**: Split `#replay()` into a synchronous `#sceneSync()` (scene cache update, decode errors surfaced) and a scheduled `#scheduleRender()` (rAF coalesced). Paste refactored to `executeTransaction()` for atomic multi-vertex add with one undo entry.

**Commits** (7 total on `feat/replay-coalescing`):

| # | Commit | Descripción |
|---|--------|-------------|
| 1 | `0acdd57` | `feat(editor): split #replay into sync sceneSync + rAF render` |
| 2 | `a9267d1` | `refactor(editor): use executeTransaction for atomic paste` |
| 3 | `b836a59` | `fix(editor): cancel pending rAF in detach() to prevent leak` |
| 4 | `71d0739` | `docs(web-shell): update stale comment about triggerReplay scheduling` |
| 5 | `990995e` | `test(editor): add rAF coalescing unit tests` |
| 6 | `99f5d74` | `test(web-shell): add E2E paste coalescing tests + render count debug API` |

**Verification**: 427/427 web-shell tests ✅, 7 Rust workspace tests (new integration test for paste undo), `cargo clippy` clean, `cargo fmt` applied.

**Artifacts**: `sddk/replay-coalescing/` (spec, design, tasks, apply-progress)

### Strategy Artifacts

- `docs/adr/0079-drawio-interaction-parity-strategy.md`
- `docs/adr/0080-keyboard-shortcut-collision-resolution.md`
- `docs/adr/0081-layer-model-gap-deferred.md` — **Resolved** (IP-F v0.91.0)
- `docs/adr/0082-engine-owned-typed-selection-semantics.md` — **Resolved** (IP-G v0.100.0)
- `docs/adr/0084-infinite-canvas-rust-wasm-lightweight-js.md` — **Phase 1+2+3 complete** (ADR-0084, v0.115.0)

### Infinite Canvas + Rust/WASM Lightweight JS (ADR-0084, 2026-07-23)

**Estrategia**: Canvas infinito como modelo de renderizado primario, motor pesado en Rust/WASM, cliente JS thin.

| Fase | Focus | Deps | Status |
|------|-------|------|--------|
| **Fase 1** | Viewport state en web-shell + clientToDoc/docToClient + wheel/pan handlers + initial viewport heuristic para .drawio | Ninguno | ✅ PR1+PR2+PR3 merged |
| **Fase 2** | Viewport culling (inline rect test, quadtree deferred) | Fase 1 | ✅ PR #218 merged (v0.114.0) |
| **Fase 3** | WASM memory optimization + animation frame budget | Fase 2 | ✅ Complete (v0.115.0) |

**Branch**: `feat/infinite-canvas` — PR1/PR2/PR3 archived, ready for release

**Artéfacts**:
- `docs/adr/0084-infinite-canvas-rust-wasm-lightweight-js.md`

**Nota de deprecated**: `expand_page_if_needed()` en `diagram-commands/src/payload.rs` será deprecada en Fase 1.

---

## 🎯 Gaps Restantes — Post-IP-G (~100 workflows)

With IP-A through IP-G closed in v0.100.0, ~100 draw.io workflows remain as individual gaps.
The workflow catalog (`docs/drawio-user-interaction-workflows.md`) shows ~165 total workflows:
~38 covered, ~27 partial, ~100 remaining. The IP slices consolidated the highest-impact,
keyboard-and-mouse centered work; what remains is more atomic, one or two flows per item,
and easier to batch as small follow-up stories rather than full epic slices.

### Triage

| Área | Gaps | Ejemplos clave | Prioridad |
|------|------|----------------|-----------|
| **Canvas nav** | 4 | Outline nav, Jump-to-shape (`Ctrl+F`), Page tab color | P0 |
| **Shape library** | 10 | Double-click chooser, Shift/Alt modifiers, Replace shape, Insert+connect | P1 |
| **Selection** | 5 (6 → 5: SEL-005 closed in v0.103.0) | Shift+Alt modifiers, rectangular marquee, rename-on-double-click | P1 |
| **Move/resize** | 4 (8 → 4: MOVE-013 + MOVE-003 + MOVE-004 + MOVE-016 closed in v0.101.0–v0.104.0) | Ctrl+arrow step, multi-shape proportional, advanced (group outer / centered / keyboard resize) | P1 |
| **Connectors** | 14 | Reverse, flip, label drag, waypoint add by drag | P1 |
| **Groups** | 13 | Collapse/expand, child lock, swimlane workflows | P1 |
| **Pages** | 6 | Rename menu, link-to-page, page thumbnail | P1 |
| **Tables** | 8 | Toda el área (deferred P2 per ADR) | P2 |
| **Style** | 6 | Default style presets, quick-style, style library | P1 |
| **Text/labels** | 4 | Text chooser, Ctrl+Shift numpad, rich portions | P1 |
| **Import/ins** | 7 | Links, tooltips, tags, templates, import filters | P2 |
| **Mob/a11y** | 4 | Touch, full keyboard matrix, screen reader parity | P3 |

**Suggested batching** (revised after v0.102.0):
- **P0 (next batch, target v0.103.0)**: Canvas nav highlights (outline nav, page tab color) + 3 remaining Move/resize modifiers (`Ctrl+arrow` step, multi-shape proportional, advanced group resize).
- **P1 (target v0.104–v0.106)**: shape-library modifiers + group cleanup + page menu + connectors polish.
- **P2 (target v0.107+)**: tables + import expansions + style presets.
- **P3 (deferred)**: Touch + collab per ADR-0048.

### Strategy notes
- After IP-G, selection modes are stable (`Mod-N` matrix in `selection-modifiers.spec.ts`).
  Selection-adjacent work should land as small spec additions rather than new epic slices.
- Connector work is mostly WASM serialization + UI; no engine redesign needed.
- Each batch should ship with E2E specs as the primary deliverable (per ADR-0075).

---

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
| 0082 | Engine-Owned Typed Selection Semantics | UX / Interaction |
| 0083 | Perimeter-Inclusive PathElement Semantic | Routing |
| 0084 | Infinite Canvas con Motor Rust/WASM y Cliente JS Ligero | Architecture |
| 0085 | rAF Coalesced Render + Atomic Paste Transaction | Performance |

## Reglas de Actualización

- Este documento se actualiza al completar cada milestone o cambiar de dirección.
- **v1.0.0 NO se publica automáticamente.** Será decisión explícita del usuario.
