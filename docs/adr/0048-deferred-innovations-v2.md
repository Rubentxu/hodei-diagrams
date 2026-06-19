# ADR-0048: Deferred Innovations — Version History, Properties, Presentation Mode

**Date:** 2026-06-19
**Status:** Accepted
**Context:** Grill-with-docs session on DESIGN.md §Version History, §Properties Panel, §Presentation Mode

## Decision

Three features identified in DESIGN.md are deferred to v2 because they require domain model extensions beyond v0.8.0. They are documented here for traceability.

### 1. Version History (v2)
**Inspiration**: Git, Notion History, Figma Versioning (per DESIGN.md)

- Store snapshots of `DiagramModel` in IndexedDB
- Each snapshot = timestamp + model serialization + optional label
- Timeline UI: horizontal scrubber below canvas, shows thumbnails
- Operations: restore any snapshot, compare two snapshots (diff view)
- **Engine dependency**: `DiagramModel` serde round-trip (already works for `.drawio` export)
- **UI dependency**: IndexedDB wrapper, timeline component

### 2. Properties Dialog (v2)
**Inspiration**: Figma, JetBrains IDEs, Unreal Engine (per DESIGN.md)

- File > Properties dialog (modal, not fixed panel)
- Fields: title, author, description, created date, modified date, tags
- **Engine dependency**: Add `Metadata { title, author, description, tags, created, modified }` to `DiagramModel`
- **UI dependency**: Dialog component, form inputs
- **Rationale for dialog not panel**: DESIGN.md draws from JetBrains/Figma where properties are contextual dialogs, not permanent panels

### 3. Presentation Mode (v2)
**Inspiration**: Figma Presentation, draw.io "Present" button (per DESIGN.md)

- Fullscreen mode: hides sidebars, inspector, navbar
- Shows only canvas + bottom page tabs + pointer
- Escape to exit
- **Engine dependency**: None (pure UI state)
- **UI dependency**: Fullscreen API, CSS class toggle

## Rationale

All three features require domain model changes (metadata) or new browser APIs (IndexedDB) that are orthogonal to the current engine work. Deferring them avoids scope creep while keeping the architecture documented.

## Consequences

- Each feature has a clear engine dependency documented — no blocked work
- Presentation Mode is the easiest (pure UI) and could be promoted to v1.1 if needed
- Version History requires designing the snapshot storage schema, which impacts diagram loading

## References

- ADR-0047: Web Shell UI v1 Architecture
- DESIGN.md §Version History, §Properties Panel, §Presentation Mode
