# ADR-0047: Web Shell UI v1 — 5-Zone Application Layout

**Date:** 2026-06-19
**Status:** Accepted
**Context:** Grill-with-docs session on DESIGN.md vs current implementation (v0.8.0)

## Decision

The web-shell UI v1 implements a 5-zone layout inspired by draw.io, Figma, and Linear, with the following scope per zone:

### Zone 1 — Top Navigation Bar
- **File**: New, Open (.drawio), Save (.drawio) → uses existing `import_drawio` / `export_drawio`
- **Edit**: Undo, Redo, Delete → uses existing `execute_command`
- **View**: Zoom in/out/reset
- **Quick controls**: Undo button, Redo button, Zoom %, Save button
- **Deferred**: Insertar submenu, Organizar submenu, Herramientas, Ayuda, Presentar, Compartir

### Zone 2 — Left Sidebar
- Structure: draw.io-style collapsible sidebar with search bar and categorized shape grid
- **v1 active category**: "General" — Rect, RoundedRect, Ellipse (3 shapes with full engine support)
- **v1 inactive categories**: Arrows, Flowchart, UML, BPMN, AWS, Azure, GCP, Kubernetes, Terraform, Jenkins, Databases, Networking, C4 — shown grayed out with tooltip "Disponible en v1.1"
- **+ More Shapes** button: disabled with tooltip "Próximamente"
- Shape stencils follow draw.io XML format in `web-shell/public/stencils/general.xml`
- **Deferred**: Diamond, Triangle, Text, Image shapes; icon libraries for cloud providers

### Zone 3 — Central Canvas
- **v1**: SVG rendering (existing), zoom/pan, page navigation tabs at bottom (draw.io-style), edge/connector display
- **v1.1**: Grid, snap, guides, multi-selection, infinite canvas
- Uses existing `render_svg` + `render_pages` from diagram-wasm
- Zoom/Pan: CSS transform on SVG container

### Zone 4 — Right Inspector
- draw.io-style tabbed panel: **Style** | **Text** | **Arrange**
- **Style tab (active)**: Fill color, Stroke color, Stroke width (slider), Dashed toggle, Rounded toggle → all mapped to `ChangeStyle` command via `execute_command`
- **Text tab (active)**: Font family dropdown, Font size input, Font color, Bold/Italic toggles → `fontFamily`, `fontSize`, `fontColor`, `fontStyle` in StyleMap
- **Arrange tab (grayed, v1.1)**: X/Y/W/H numeric inputs → would use `MoveVertex` with absolute geometry
- **Deferred**: Shadow, Glass Effects, Metadata, Tags, Lock/Visibility, Alignment, Markdown

### Zone 5 — Bottom Area
- **Page tabs**: draw.io-style horizontal tabs (Page-1 | Page-2 | ＋) — replaces current `<select>` page selector
- **Diagnostics banner**: Collapsible toast showing import warnings from `parse_drawio_with_diagnostics`
- **Deferred**: Version history timeline, Properties panel

### Design System
Per DESIGN.md §colors, §typography, §spacing, §radius, §motion:
- Color palette: Neutral 900/800/700/600 background scale, accent blue/cyan/purple/emerald
- Typography: Inter (display/heading/body) + JetBrains Mono (mono)
- Spacing scale: xs=4, sm=8, md=12, lg=16, xl=24, xxl=32
- Border radius: sm=6, md=10, lg=14
- Motion: fast=120ms, normal=180ms, slow=280ms (CSS transitions)

### Innovations (v2)
Documented for future cycles:
- **Version History** (ADR-0048): IndexedDB-persisted timeline, snapshot comparison → inspiration: Git, Figma Versioning, Notion History
- **Properties dialog** (ADR-0048): File > Properties with title, author, description, created/modified dates
- **Presentation Mode** (ADR-0048): Fullscreen canvas-only view

## Rationale

- **Engine-first**: All 11 inspector controls map to existing engine commands. Zero fake UI.
- **draw.io inspiration**: Sidebar structure, page tabs, inspector tabs — users familiar with draw.io will recognize the layout.
- **Scope discipline**: Grayed-out sections communicate the roadmap without blocking testing of what already works.
- **Design system**: DESIGN.md provides a concrete, measurable visual spec — avoids subjective "looks good" debates.

## Consequences

- **Positive**: User can test all engine capabilities (import, render, select, move, delete, undo, style, save) from a coherent UI.
- **Positive**: Grayed-out sections set expectations and build anticipation for v1.1.
- **Negative**: Full 5-zone UI is ~1500-2000 LOC of TypeScript + CSS. Requires careful module organization.
- **Negative**: Zoom/pan on SVG is CPU-bound; WebGPU acceleration would be needed for 60fps at 10K+ shapes.

## Alternatives Considered

| Alternative | Rejected because |
|---|---|
| Keep minimal viewer + add features one by one | User needs coherent UI to test engine; piecemeal additions create inconsistent UX |
| Build all DESIGN.md features now | Engine doesn't support diamond, shadows, metadata, layers — would be fake UI |
| Use a UI framework (React, Svelte) | ADR-0041 chose vanilla TS; framework adds complexity for a thin shell |

## References

- ADR-0002: TypeScript Web Shell over Rust Engine
- ADR-0003: SVG First Render Backend, WebGPU Later
- ADR-0004: Minimal WASM Boundary
- ADR-0005: Command-Driven Engine
- ADR-0015: Renderers Consume Scene, Not Core Model
- ADR-0041: Web Shell Vite + Vitest + Playwright Toolchain
- ADR-0042: Web Shell Editor Surface Decisions
- DESIGN.md: Visual personality, design system, layout philosophy
