# ADR-0061: Advanced Visual Effects — Shadow, Glass, Gradient

**Date:** 2026-06-20
**Status:** Accepted
**Context:** Plan de paridad funcional con draw.io (Fase 8)

## Decision

Three new visual effects on shapes: drop shadow, glass, gradient fill.
All are **SVG-native** — no CSS, no canvas, no filters requiring GPU.

### Shadow

```rust
pub struct ShadowConfig {
    pub enabled: bool,
    pub dx: f64,           // offset X, user-space units
    pub dy: f64,           // offset Y
    pub blur: f64,         // std deviation
    pub color: String,     // hex, e.g. "#00000080"
}
```

SVG output:

```xml
<defs>
  <filter id="shadow-N">
    <feDropShadow dx="2" dy="2" stdDeviation="3" flood-color="..." />
  </filter>
</defs>
<rect ... filter="url(#shadow-N)" />
```

### Glass

```rust
pub struct GlassConfig {
    pub enabled: bool,
    pub opacity: f64,      // 0.0..1.0
    pub blur: f64,         // backdrop blur, currently a no-op in SVG
}
```

SVG output: `<rect ... fill-opacity="0.5" />` plus a CSS class
`shape--glass` for the shell to apply a real backdrop filter when
available.

### Gradient

```rust
pub struct GradientConfig {
    pub kind: GradientKind,    // Linear | Radial
    pub angle: f64,            // degrees, for Linear
    pub stops: Vec<GradientStop>, // 2..5 stops
}
```

SVG output: `<defs><linearGradient>...</linearGradient></defs>` + `fill="url(#grad-N)"`.

### Style storage

All three live on `ResolvedStyle`:

```rust
pub struct ResolvedStyle {
    pub fill_color: Option<String>,
    pub stroke_color: Option<String>,
    pub stroke_width: Option<f64>,
    pub rounded: Option<bool>,
    pub font_color: Option<String>,
    pub font_size: Option<f64>,
    pub font_family: Option<String>,
    pub shadow: Option<ShadowConfig>,
    pub glass: Option<GlassConfig>,
    pub gradient: Option<GradientConfig>,
}
```

### Default behavior

- `shadow`, `glass`, `gradient` default to `None` (off)
- No behavior change for existing shapes
- `<filter>`/`<gradient>` defs are emitted once per page

## Rationale

- draw.io's visual richness comes from these three effects.
- SVG filters and gradients are well-supported across browsers.
- Storing on `ResolvedStyle` (not as a new field) keeps the surface flat.
- Backdrop-filter fallback is a future enhancement; for v1, glass is
  opacity-only.

## Consequences

- **Positive**: Diagrams look closer to draw.io's polish.
- **Positive**: Inspector tab "Style" gets richer.
- **Negative**: SVG `<defs>` adds bytes per page.
- **Negative**: Backdrop filter is a progressive enhancement; some
  browsers won't blur the canvas behind the shape.
- **Negative**: Gradient stops are duplicated in `.drawio` round-trip
  if the parser doesn't preserve order. Mitigated by stable serialization.

## References

- `crates/diagram-core/src/style.rs` (existing `ResolvedStyle`)
- `crates/diagram-render-svg/src/element.rs` (where to emit defs)
- DESIGN.md §Visual Personality (no glassmorphism, but controlled effects)
