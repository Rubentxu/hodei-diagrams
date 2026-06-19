# ADR-0042: Web Shell Editor Surface v1.1

**Status:** Accepted
**Date:** 2026-06-19

## Context

ADR-0002/0005 mandate the shell stays a thin host: no editing logic, all mutations via commands. The viewer v1 injects engine SVG but has no interaction. To become an editor the shell must map DOM events to `CommandMessage`, re-render after each command, and identify which entity a click hit. Explore (`sddk/web-shell-editor/explore-report.md`) surfaced three open questions (U1 hit-test strategy, U2 re-render PageId mismatch, U3 selection ownership) and confirmed 12 ready commands + scene hit-test data.

## Decision

1. **Selection model**: single selection, client-side ephemeral (`VertexId | null` in `editor.ts`). Not engine-authoritative for v1.1.
2. **Re-render strategy**: full re-render of the active page after each command (simple, correct). Per-page, not all-pages — enabled by the R2 fix.
3. **Hit-testing**: hybrid — engine embeds `data-vertex-id="idx:version"` on rect/ellipse SVG elements; shell parses attribute on click via `closest('[data-vertex-id]')`. Scene-based bounding-box fallback deferred.
4. **R2 resolution**: `diagram-wasm` `render_svg` accepts flat `u64` page_id, removing the wire-format inconsistency permanently.
5. **Palette scope**: rectangle + ellipse only this cycle, single-placement mode (tool deselects after one shape).
6. **Event handling**: event delegation on the persistent viewer container (survives innerHTML swap via AbortController). Drag commits MoveVertex on mouseup with absolute geometry (computed from original scene geometry + delta).
7. **Command construction**: shell builds JSON payloads from event data; `editor.ts` never imports `./wasm` (invariant verified via grep).
8. **Drag threshold**: 3px before drag mode engages (disambiguates click vs drag).
9. **Scene cache**: `editor.ts` maintains `#sceneCache` populated by `getScene()` on attach and after each command. Required for drag geometry lookup and palette `page_id`.
10. **Slotmap wire format**: `data-vertex-id="idx:version"` compact format. `parseSlotmapAttr` splits on `:` and parses both fields. No JSON-in-attribute to avoid quote-escaping issues.

## Alternatives Rejected

- **Engine-side hit-test endpoint + spatial index**: over-engineered for v1.1.
- **Re-render all pages on every command**: wasteful for multi-page diagrams.
- **Server-authoritative selection**: premature for client-only v1.1.
- **Separate EditorSession class**: inheritance complexity for 6 additive methods.
- **JSON-in-attribute for data-vertex-id**: fragile quote-escaping in SVG attributes.
- **Delta-based MoveVertex in shell**: engine expects absolute `CellGeometry`; shell computes new absolute position.

## Consequences

- The shell now actively parses engine IDs and constructs command JSON both ways — CoT on the slotmap ID and command-tagging format becomes a real (untyped, cross-boundary) coupling, mitigated by typed TS helpers and Vitest round-trip tests.
- `render_svg` signature change (JSON string → flat u64) is a breaking change at the TS level; all callers updated.
- `data-vertex-id` attribute increases SVG size minimally but enables direct hit-testing without scene JSON parsing.
- Future v2 shared-buffer transport (ADR-0004) and multi-select will revisit these seams.
- Engine changes (R2 + data-vertex-id) are additive and isolated to `diagram-wasm/src/render.rs` and `diagram-render-svg/src/element.rs`; reverting restores viewer v1 unchanged.

## Files Changed

| File | Action |
|------|--------|
| `crates/diagram-wasm/src/render.rs` | R2 fix: `render_svg(handle, page_idx: u64)` |
| `crates/diagram-render-svg/src/element.rs` | `vid_attr` helper + data-vertex-id on rect/rounded_rect/ellipse |
| `web-shell/src/types.ts` | `SlotmapId`, `parseSlotmapAttr`, `ScenePage`, `WasmModule` sig update |
| `web-shell/src/session.ts` | `executeCommand`, `undo`, `redo`, `canUndo`, `canRedo`, `getScene`, `renderPage` |
| `web-shell/src/editor.ts` | Hit-test, selection, drag FSM, command builders, palette |
| `web-shell/src/renderer.ts` | `applySelectionClass` |
| `web-shell/src/ui.ts` | Toolbar buttons (undo/redo/rect/ellipse) |
| `web-shell/src/main.ts` | Editor wiring, toolbar button bindings |
| `web-shell/src/styles.css` | `.selected` highlight, toolbar styles |
| `web-shell/tests/` | 83 Vitest tests, 6 Playwright E2E tests |
