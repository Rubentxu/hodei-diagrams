# UI Gap Slice Plan — v0.9.0 → DESIGN.md Target

This document converts ADR-0049 into concrete, reviewable UI slices.

## Reference Frame

- **Current:** implemented 5-zone shell (`v0.9.0`)
- **Target:** high-density engineering product aligned with `DESIGN.md`
- **Reference inspirations:** draw.io (discoverability), Figma (canvas priority), JetBrains (inspector density), Linear/Cursor (clarity)

## Slice A — Product Presence

### Objective
Make the product immediately read as a purposeful application.

### Deliverables
- Strengthened top bar grouping and spacing
- Left rail with icon-based primary sections
- Sidebar category headers with clearer affordances
- Inspector empty states with explanatory content
- Bottom area with clearer page tab affordances and diagnostics presentation

### Acceptance Signals
- First-time user can identify where to open, save, insert shapes, inspect properties, and navigate pages within 10 seconds
- No area feels visually abandoned or placeholder-like

## Slice B — Professional Density

### Objective
Increase information density without making the interface noisy.

### Deliverables
- Grid overlay toggle
- Status strip / HUD for zoom, selection, page, mode
- Compact control styling in inspector
- Better control grouping and labels in sidebar and inspector
- Design token normalization from `DESIGN.md`

### Acceptance Signals
- Interface looks deliberate and dense, not sparse
- Canvas still remains visually dominant

## Slice C — Platform Surface

### Objective
Expose product-level workflows beyond basic editing.

### Deliverables
- Version history timeline (if promoted)
- Properties dialog
- Presentation mode
- Extended stencils and categories
- Export surfaces

### Acceptance Signals
- Product feels like a platform, not just a shape editor

## Traceability Matrix

| DESIGN.md Section | Slice |
|---|---|
| Top Bar | A |
| Left Sidebar | A/B |
| Right Inspector | A/B |
| Canvas | B |
| Properties Panel | C |
| Version History | C |
| Presentation Mode | C |
| Design Goals | A/B/C |

## Recommended Execution Order

1. `feat/web-shell-ui-presence`
2. `feat/web-shell-ui-density`
3. `feat/web-shell-ui-platform-surface`

Each slice should ship with screenshots + Playwright assertions for structural presence.
