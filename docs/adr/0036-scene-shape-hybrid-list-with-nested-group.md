# ADR-0036: Scene Shape — Hybrid List + Nested Group

## Status

Accepted

## Context

ADR-0015 mandates that renderers consume a scene, not the core model directly. The scene must carry visual hierarchy (groups clip children; z-order is document order) without coupling to any specific renderer. Four options were evaluated in the `diagram-scene` proposal:

- **A. Flat `Vec<RenderCommand>`** — A single flat list of draw commands. Rejected: loses hierarchy entirely; group boundaries become invisible; z-order is fragile to undo/redo operations.
- **B. Full scene graph with transform matrices** — A proper tree with 4×4 transform matrices per node. Rejected: overkill for static diagrams; no transform chains beyond group translation in v1; adds complexity without clear benefit.
- **C. Hybrid list + nested Group** — A `Vec<VisualElement>` per page where `GroupElement` carries `children: Vec<VisualElement>`. **Accepted.**
- **D. Borrowed slices `Scene<'a>`** — Lifetime-parameterized borrowed scene. Rejected: lifetime friction across async render loops; premature optimization; slotmap iteration order is deterministic anyway.

## Decision

`diagram-scene` exposes `Scene { pages: Vec<PageScene> }` where each `PageScene.display_list: Vec<VisualElement>` and `VisualElement::Group(GroupElement { children: Vec<VisualElement>, clip: bool, .. })` carries nested children. The display list is back-to-front = `.drawio` XML document order = slotmap insertion order.

The `VisualElement` enum uses struct-per-variant pattern (not enum-with-payload) so adding fields to one element type does not affect others. The enum and all public structs are `#[non_exhaustive]` to force compile errors when new variants are added — a deliberate forcing function to keep renderers in sync.

## Rationale

Option C matches draw.io's structure (page → top-level elements → groups), preserves z-order implicitly via iteration order, makes clipping intrinsic to `Group`, is multi-page from day one, and lets both SVG (`<g clip-path>`) and WebGPU (instance hierarchy) consume the same shape.

The struct-per-variant pattern means adding `Triangle`, `Image`, or `Cylinder` later requires updating every renderer that exhaustively matches `VisualElement` — a compile error rather than a silent runtime bug.

Renderers that need a flat command list (e.g., WebGPU instance buffers) must flatten the tree themselves. The flatten is a single recursive walk and is renderer-specific — the scene projection layer does not pre-flatten.

## Consequences

**Enables:**
- Multi-page scenes with independent display lists.
- Group clipping as a first-class concept.
- Z-order preserved via insertion order.
- Renderers (SVG, WebGPU) share the same scene shape.
- `#[non_exhaustive]` forces compile-time migration when new element kinds are added.

**Constrains:**
- Renderers that want flat command lists must implement their own flatten.
- Diffing two scenes requires a tree diff; scene v1 does not provide a diff API.
- Nested groups (groups inside groups) are not yet exercisable because `Group` has no `parent` field. Forward-compatibility helper signatures accept `Option<&CellGeometry>` for future parent-chain walk.

## References

- Proposal: `sddk/diagram-scene/proposal.md`
- Spec: `sddk/diagram-scene/spec.md`
- Design: `sddk/diagram-scene/design.md`
- ADR-0015: Renderers consume a scene, not core model
- ADR-0023: Engine-owned stable IDs
