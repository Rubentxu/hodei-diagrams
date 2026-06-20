# ADR-0052: Shape Catalog — Supported and Deferred

**Date:** 2026-06-20
**Status:** Accepted
**Context:** Plan de paridad funcional con draw.io (Fase 1)

## Decision

The engine supports a **fixed initial catalog of 10 shape kinds**. Beyond
these, shapes are deferred to a future stencil system (ADR-0059).

### Supported in v0.10.0

| ShapeKind | Style hint | Notes |
|---|---|---|
| `Rect` | (default) | axis-aligned rectangle |
| `RoundedRect` | `rounded=1` | rectangle with corner radius |
| `Ellipse` | `shape=ellipse` | true ellipse |
| `Diamond` | `shape=rhombus` | new |
| `Triangle` | `shape=triangle` | new |
| `Hexagon` | `shape=hexagon` | new |
| `Cylinder` | `shape=cylinder` | new (3D-ish) |
| `Cloud` | `shape=cloud` | new |
| `Parallelogram` | `shape=parallelogram` | new |
| `Trapezoid` | `shape=trapezoid` | new |

### Deferred to v2 (stencil system)

- Custom shape paths from `.drawio` stencils
- Image shapes (raster)
- Arrow shapes (separate kind with direction)
- Connector-like shapes
- Swimlane / container shapes (already exist as `Group`)

## Rationale

- 10 covers the most-used draw.io shapes (80/20 of real diagrams).
- New shapes are not invented; they map to existing draw.io style keys so
  round-trip with `.drawio` files keeps working.
- The classification logic in `StyleResolver::classify()` already maps style
  keys to `ShapeKind`. We extend that mapping rather than create a parallel
  taxonomy.

## Consequences

- **Positive**: Sidebar can show 10 functional shapes, not 3.
- **Positive**: `.drawio` round-trip continues to work for these shapes.
- **Positive**: Engine surface grows by ~600 LOC, all in the existing
  scene/renderer crates.
- **Negative**: Beyond 10 shapes, we need a real stencil system. ADR-0059.
- **Negative**: Polygon (free-form points) is a separate ADR (0053).

## References

- ADR-0021: Start Styles as Flexible Map
- ADR-0024: Preserve Unknown When Safe
- ADR-0053: Polygon Generalization
- ADR-0059: Stencil Format Spec
