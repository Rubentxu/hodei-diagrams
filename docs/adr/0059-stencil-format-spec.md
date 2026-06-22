# ADR-0059: Stencil Format Spec

**Date:** 2026-06-20
**Status:** Accepted
**Context:** Plan de paridad funcional con draw.io (Fase 6)

## Decision

Stencils use the **draw.io stencil XML format** loaded as a static
asset per library.

### File format

Stencils are XML files with this shape:

```xml
<shapes name="uml">
  <shape name="Class" aspect="variable" w="120" h="60">
    <background>
      <path>M 0,0 L 120,0 L 120,60 L 0,60 Z</path>
    </background>
    <foreground>
      <fillstroke/>
    </foreground>
  </shape>
</shapes>
```

Path commands use **compact SVG path text syntax** (same as SVG `d` attribute):
`M`=move, `L`=line, `Q`=quadratic bezier, `C`=cubic bezier,
`A`=arc, `Z`=close. Coordinates are absolute, relative to the shape's `w`/`h`.
Child-element form (`<move x="0" y="0"/>`) is **not supported**.

### Where stencils live

```
web-shell/public/stencils/
├── general.xml      # Rect, RoundedRect, Ellipse, Diamond, ...
├── uml.xml          # Class, Interface, Actor, ...
├── bpmn.xml         # Task, Gateway, Event, ...
├── aws.xml          # EC2, S3, Lambda, ...
├── flowchart.xml    # Start, Decision, Process, ...
```

### Loading

- Bundled stencils ship with the web-shell
- WASM exposes `parse_stencil(xml: &str) -> Result<Stencil>`
- The shell fetches `stencils/<lib>.xml` at boot, parses once, caches
- User can disable a library from the sidebar (UI ships enabled by default)

### Drag-to-canvas

Drop a stencil on the canvas:
1. Shell computes the drop point
2. Shell sends `AddVertex` with the stencil's `style` and default
   geometry
3. Engine inserts, scene projects, renderer draws

### Stencils subset supported

v1 supports: `M` (move), `L` (line), `Q` (quadratic bezier), `C` (cubic bezier), `A` (arc), `Z` (close).
Deferred: text styling, gradients, image fills, `<fillstroke/>` as child element (emit diagnostics only).

### Licensing

Only open-source stencils (MIT/Apache/CC0) are bundled. Each stencils
file includes a `<!-- license: MIT -->` comment. Restricted stencils
(AWS, Azure) are **not** bundled in v1; users add them via custom URL.

## Rationale

- Using the draw.io format means zero conversion work for any existing
  stencil library.
- Bundling as static XML is simple, fast, and works offline (ADR-0002
  offline-first principle).
- Restricting to open-source licenses avoids the legal minefield of
  redistributing cloud vendor stencils.

## Consequences

- **Positive**: Sidebar can show real libraries (UML, BPMN, Flowchart).
- **Positive**: Reuses draw.io ecosystem.
- **Positive**: Engine gets a `parse_stencil` for free.
- **Negative**: Stencil format has quirks; we support a subset.
- **Negative**: User-added stencils (CORS, security) deferred to v2.
- **Negative**: Sidebar still has many greyed-out libraries until we
  bundle stencils for them.

## References

- ADR-0052: Shape Catalog
- `diagram-stencils/src/parse.rs` — parser implementation (compact SVG path text format)
- ADR-0024: Preserve Unknown When Safe

## Amendment History

| Date | Change |
|------|--------|
| 2026-06-22 | Corrected path format: child-element syntax (`<move x="0" y="0"/>`) is not supported; compact SVG text syntax (`M 0,0 L 120,0 ...`) is the only supported format. ADR example updated. |
