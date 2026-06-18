# ADR-0038: Multi-page SVG output

## Decision

`SvgRenderer::render_pages(&Scene) -> Result<Vec<(PageId, String)>, RenderError>` returns one self-contained SVG per page in `Scene.pages` iteration order. Each document is independent (own `<svg>` root, `<defs>`, `viewBox`, `<title>`, clip-path counter).

## Context

Needed before WASM streaming (next cycle) and before the web-shell mount; both consumers benefit from a `Vec` shape that lets them mount pages lazily.

## Rationale

Matches draw.io's own per-page export, lets the future `diagram-render-wgpu` reuse the same `Vec<(PageId, String)>` boundary, and avoids forcing a single-document policy on multi-page scenes.

## Consequences

- Clip-path counter resets per page (spec §C4).
- `PageId` is part of the public API surface (drives PR -1).
- `render(&Scene, PageId)` remains available for single-page use cases.
