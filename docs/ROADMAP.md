# Roadmap — Hodei Diagrams

Estado vivo del proyecto. Actualizar en cada milestone o cambiar de dirección.
Para rationale de decisiones, ver `docs/adr/`.

## Estado Actual

**v0.76.0 — Phase 2 P2-3 Phase B completo (WASM + TS decoder).**
Phase A (scene buffer, v0.72.0) + Phase C (SVG buffer, v0.73.0) + Phase D (3.32× browser validation, v0.74.0) + Phase B (command buffer zero-copy JS→Rust, v0.75.0) + TS postcard decoder (v0.76.0) cierran el ciclo completo zero-copy:
- **WASM→JS**: `readSceneBuffer()` + `PostcardDecoder` (todas las variantes de VisualElement) → typed Scene sin JSON parse
- **JS→WASM**: `flushCommands()` + `postcard::from_bytes<Vec<Command>>` → atomic batch dispatch
- Benchmark: 3.32× en browser para scene reads, ~2% diferencia native (to_domain domina)

E2E Coverage Campaign: **472/472 tests green** (v0.69.0). Zero regressions.

| Crate | Capa | Status |
|-------|------|--------|
| `diagram-core` | Dominio | ✅ |
| `diagram-format-drawio` | Compatibilidad | ✅ |
| `diagram-commands` | Comandos | ✅ (17 commands) |
| `diagram-compat-testkit` | Testing | ✅ |
| `diagram-scene` | Proyección | ✅ (PathElement + endArrow/startArrow) |
| `diagram-render-svg` | Render SVG | ✅ (data-edge-id + arrow markers) |
| `diagram-render-wgpu` | Render WebGPU | ✅ |
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

### Phase 2 — Zero-Copy WASM Bridge (v0.70.0–v0.76.0)
- v0.70.0: perf-baseline spec captured
- v0.71.0: N=20 native bench — engine 6× faster natively than in browser
- v0.72.0: Phase A (scene buffer, Rust→JS zero-copy, 3.8× native speedup)
- v0.73.0: Phase C (SVG buffer, Rust→JS zero-copy, native parity)
- v0.74.0: Phase D (browser validation — 3.32× confirmed in browser)
- v0.75.0: Phase B (command buffer JS→Rust, `flush_commands` + `execute_batch` atomic)
- v0.76.0: TS postcard decoder (`PostcardDecoder` — 17 VisualElement variants, typed Scene read)

Next phase: **Nivel 4 (WebGPU)** — scene → instance projection para las 17 variantes de VisualElement.

### Test counts (post-audit)
- Rust: ~700+ unit/integration tests, all passing (`just verify` clean)
- Web-shell: 202 unit tests passing
- E2E: 472/472 green ✅ (8 intentional skips documented in test bodies). Zero regressions.

### Tier 1-3 closures landed in this batch (also shipped before v0.64.0)
- Image import (style-driven `ShapeKind::Image` + SVG rendering) — PR #93
- Stencil libraries (FillStroke/Fill/Stroke element parsing + diagnostics) — PR #94
- Connection Points Phase A (style-driven via `Anchor` enum) — PR #91
- Connection Points Phase B (TS port-handles overlay + WASM anchor commands) — PR #95
- More stencil libraries (TS UI: dynamic loading via file picker) — PR #96
- Swimlanes Phase 1 + 2 (Group.parent + SwimlaneHeader + SVG rendering) — PR #92

---

## 🎯 Next: Nivel 4 (WebGPU)

`ShapeInstance` POD types listos en `crates/diagram-render-wgpu/src/buffers.rs`. Necesita la proyección scene → instance para las 17 variantes de VisualElement. En revisión de detalle (punto 1 pendiente).

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

## Reglas de Actualización

- Este documento se actualiza al completar cada milestone o cambiar de dirección.
- **v1.0.0 NO se publica automáticamente.** Será decisión explícita del usuario.
