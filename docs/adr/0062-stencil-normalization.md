# ADR-0062: Stencil Coordinate Normalization Strategy

**Date:** 2026-06-22
**Status:** Accepted
**Context:** Phase 6 Stencils — parsing XML stencil libraries

## Decision

Stencil coordinates from XML library files are **normalized at parse time** in `diagram-stencils`.

Each `PathCommand`'s absolute coordinates (e.g., `M 0,0 L 120,0` for a shape with `w=120, h=60`) are transformed to the unit square `[0,1] × [0,1]` before the `Stencil` struct is constructed.

The normalized unit is always `[0,1]` regardless of the original `w`/`h` aspect ratio.

## Normalization Algorithm

```
normalized_x = absolute_x / shape_width
normalized_y = absolute_y / shape_height
```

Arc radii (`A` command `rx`, `ry`) are normalized by the geometric mean of `w` and `h`:
```
normalized_rx = absolute_rx / ((w + h) / 2)
normalized_ry = absolute_ry / ((w + h) / 2)
```

This preserves the visual aspect ratio of arcs on non-square shapes.

## Rationale

- **Consistency with built-in stencils**: The hardcoded `stencil_registry.rs` shapes all use `[0,1]` normalized coords. A shared `PathCommand` enum means both sources must use the same coordinate system.
- **Renderer simplicity**: `stencil_to_svg` in `diagram-render-svg` scales `[0,1]` coords to the vertex's `bounds.size`. A single scale path in the renderer is simpler and less error-prone.
- **Cache simplicity**: Engine-level cache stores `Stencil` with normalized coords. No per-render normalization needed.

## Consequences

- **Positive**: Single coordinate system throughout the pipeline; no branching in renderer.
- **Positive**: Parser is the sole normalization point; renderer and scene are coord-system agnostic.
- **Negative**: Parser does more work per parse; negligible for XML files of <100KB.
- **Negative**: If a future stencil format uses different semantics for coordinates, this ADR may need revision.

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| Normalize at build-time (scene builder) | Parser stays simple | Builder must know coord system; coupling to renderer |
| Normalize at render-time (SVG renderer) | Most flexible | Scale math duplicated everywhere; easy to forget |
| Pass through absolute coords | No parser work | Breaks existing renderer contract; must change `StencilElement` + renderer |

## References

- `crates/diagram-stencils/src/parse.rs` — `parse_stencil_library`
- `crates/diagram-scene/src/stencil_registry.rs` — built-in coordinate system
- ADR-0059: Stencil Format Spec
