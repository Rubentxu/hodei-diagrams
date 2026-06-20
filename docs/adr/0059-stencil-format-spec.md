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
      <path>
        <move x="0" y="0"/>
        <line x="120" y="0"/>
        <line x="120" y="60"/>
        <line x="0" y="60"/>
        <close/>
      </path>
    </background>
    <foreground>
      <fillstroke/>
    </foreground>
  </shape>
</shapes>
```

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

v1 supports: `move`, `line`, `quad`, `curve`, `arc`, `close`, `fillstroke`.
Deferred: text styling, gradients, image fills.

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
- `/var/home/rubentxu/Proyectos/rust/_upstream/mxgraph/javascript/examples/stencils.xml`
- ADR-0024: Preserve Unknown When Safe
