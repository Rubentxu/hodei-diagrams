# ADR-0057: Rotation/Flip Geometry Model

**Date:** 2026-06-20
**Status:** Accepted
**Context:** Plan de paridad funcional con draw.io (Fase 4)

## Decision

Add a `Transform` field to `CellGeometry` for rotation and flip:

### Data shape

```rust
pub struct CellGeometry {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub relative: bool,
    pub rotation: f64,   // radians, 0.0 default
    pub flip_h: bool,   // horizontal flip
    pub flip_v: bool,   // vertical flip
}
```

### Defaults preserve compatibility

All three new fields default to `0.0` / `false`. Existing `.drawio` files
without rotation parse identically.

### SVG output

The renderer emits a `transform` attribute on the shape:

```xml
<rect x="0" y="0" width="80" height="40"
      transform="rotate(45 40 20) scale(1 -1)"
      ... />
```

- `rotate(angle cx cy)` rotates around the shape's center
- `scale(-1 1)` flips horizontally; `scale(1 -1)` flips vertically

### Commands

- `RotateCommand { id, angle_delta }` — rotates by a delta (e.g., 90°)
- `FlipCommand { id, axis }` — flips horizontal or vertical

### UI bindings

- `R` rotates selection by 90°
- `Shift+R` rotates by 15° (fine adjustment)
- `H` flips horizontally
- `V` flips vertically

### Resize handles

8 resize handles on the selected shape's bounding box:
- 4 corners (resize + rotate, with shift for proportional)
- 4 edge midpoints (resize one axis)

v1 supports corner handles only; edge handles are deferred to v2.

## Rationale

- Rotation and flip are part of the standard "shape manipulation" set.
  Without them, shapes feel static.
- Putting transform on `CellGeometry` keeps the renderer surface flat
  (one element per shape) and matches draw.io's `mxGeometry rotate=`
  field.
- Commands for rotate and flip keep undo atomic and the engine state
  pure.

## Consequences

- **Positive**: Rotation is a first-class operation in the engine.
- **Positive**: Round-trip with `mxGeometry rotate="45"` works.
- **Positive**: Inspector Arrange tab gets rotation/flip controls.
- **Negative**: Resize handles are a non-trivial UI surface (drag,
  scale, proportional mode). v1 corner-only is acceptable.
- **Negative**: Bounds calculation in `element_bounds()` must account for
  rotation; the existing AABB is the *axis-aligned* bounding box of the
  rotated shape, not the visual box. Acceptable for v1.

## References

- ADR-0020: Core Model Starts with Pages, Groups, Styles, and Labels
- `crates/diagram-core/src/geometry.rs` (existing `CellGeometry`)
- `crates/diagram-format-drawio/src/mapping.rs` (existing `mxGeometry`
  parsing — must be extended)
