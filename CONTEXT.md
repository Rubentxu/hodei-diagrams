# Hodei Diagrams

Hodei Diagrams existe para construir una plataforma de diagramación en la que el núcleo del producto es un motor reutilizable. El editor visual, la compatibilidad con `.drawio` y futuros clientes automatizados se apoyan en ese motor, no al revés.

## Language

**Diagram Engine**:
The core product that owns the diagram model, commands, import/export, layout, routing, hit-testing, and render scene generation. It is the primary system in this repository; editors and automations are clients of it.
_Avoid_: Editor, draw.io clone, frontend app

**Semantic Port**:
A Rust reimplementation that preserves the externally observable behavior and `.drawio` interoperability of draw.io/diagrams.net without line-by-line source translation. It treats the upstream codebase as a behavioral and format reference, not as code to mechanically rewrite.
_Avoid_: Literal port, greenfield rewrite, loose inspiration

**`.drawio Compatibility`**:
The ability of the Diagram Engine to import, represent, and export `.drawio` diagrams with predictable round-trip behavior for the supported feature set. Compatibility is a product contract, not a best-effort nice-to-have.
_Avoid_: Optional import, approximate support

**Behavioral Reference**:
The observable editor behavior and `.drawio` file semantics that define what the Semantic Port must preserve. Upstream source code is a reference for understanding that behavior, not the normative source of truth.
_Avoid_: Source translation target, internal JS classes as specification

**Web Shell**:
A minimal TypeScript client that hosts browser integration concerns such as DOM events, canvas/SVG mounting, and editor chrome while delegating diagram behavior and state ownership to the Diagram Engine.
_Avoid_: Rich frontend app, duplicated editor logic, Rust UI frontend

**WASM Boundary**:
The narrow interface between the Web Shell and the Diagram Engine, expressed as small input events, commands, and shared buffers rather than rich object graphs. It exists to move user intent and render data cheaply without shifting product logic out of the engine.
_Avoid_: JSON-heavy bridge, JS-owned model copies, chatty per-shape callbacks

**Command Flow**:
The rule that user intent enters the Diagram Engine as explicit commands and the engine responds with state changes and render diffs. It borrows the clarity of Redux-style unidirectional flow without forcing the internal engine to be a literal Redux store.
_Avoid_: Direct mutation from arbitrary callers, Redux-as-framework, reducer-everywhere dogma

**Render Backend**:
A pluggable renderer that consumes scene data produced by the Diagram Engine. Backend choice affects performance and ergonomics, but it must not redefine diagram behavior or file semantics.
_Avoid_: Renderer-owned behavior, UI-driven rendering rules

**DiagramEngineSession**:
A TypeScript class in the Web Shell that wraps the `diagram-wasm` WASM bridge. It is the sole importer of the WASM module and abstracts the engine handle lifecycle, JSON serialization, and error mapping. All other shell code communicates through the session, never directly with WASM exports.
_Avoid_: Direct wasm_bindgen calls in UI code, raw JsValue handling outside session.ts

**PageToken**:
An opaque branded TypeScript type (`number & { readonly __brand: unique symbol }`) representing a page descriptor returned by `render_pages`. v1 treats it as a display-only token to avoid the PageId wire-format inconsistency between `render_pages` (flat u64) and `render_svg` (slotmap object).
_Avoid_: Raw number, parsing PageId shape in the shell

**MountedSvg**:
The result of injecting an SVG string from the engine into the DOM via `innerHTML`. The engine is the trust boundary — SVG strings are treated as trusted content since the engine owns all rendering logic.
_Avoid_: User-supplied innerHTML, client-side SVG parsing, DOM manipulation of engine output

## Layout Engines

**TreeLayout**:
The Moen compact tree layout algorithm (ADR-0067), ported from `mxCompactTreeLayout.js`. Produces hierarchical tree layouts with jetty routing and automatic group bounding-box resizing.
_Avoid_: Sugiyama layout (that is the HierarchicalLayout variant)

**OrganicLayout**:
The Fruchterman-Reingold force-directed layout algorithm (ADR-0068), ported from `mxGraphLayout.js`. Produces force-directed graph layouts where connected vertices attract and all vertex pairs repel. Deterministic (no Math.random()).
_Avoid_: Random layout, iterative without convergence guarantee

**CircularLayout**:
The circular layout algorithm (ADR-0069), ported from `mxCircleLayout.js`. Places all page vertices at equal angular intervals on a computed circle. O(n), deterministic, closed-form — no iteration.
_Avoid_: Organic-style force-directed (that uses OrganicLayout)

**GridLayout**:
The Hodei-original grid placement algorithm. Two-pass cumulative-offset placement (column widths accumulate from `col_max_w`, row heights from `row_max_h`) so that heterogeneous vertex sizes never overlap. Deterministic, single-pass, no draw.io equivalent.
_Avoid_: Per-vertex cell formulas that ignore width/height heterogeneity

**HierarchicalLayout**:
The Sugiyama 4-stage pipeline layout (ADR-0045). Cycle removal → layer assignment → crossing reduction → coordinate assignment. Mutates the engine model in-place (no `TreeLayoutResult`), reached via the dedicated `apply_hierarchical_layout` WASM export rather than `apply_layout`.
_Avoid_: Treating HierarchicalLayout as one option among many — its mutates-in-place contract is part of the type, not an accident

**mxCircleLayout**:
The upstream draw.io JavaScript layout algorithm that CircularLayout ports. Used as the behavioral reference for the O(n) closed-form circular arrangement.
_Avoid_: Internal implementation detail as specification

**move_circle**:
A `CircularLayoutConfig` field. When `true`, the circle center is pinned to `(x0 + radius, y0 + radius)`. When `false` (default), the center is computed as `(min_x + radius, min_y + radius)` where min_x/min_y are the top-left corners of the bounding box of all vertex positions.
_Avoid_: Confusing with geometry origin — this is a layout parameter, not a vertex coordinate

**CircularLayoutConfig**:
Configuration struct for CircularLayout. Fields: `radius` (default 100.0), `move_circle` (default false), `x0` (default 0.0), `y0` (default 0.0), `reset_edges` (default true), `disable_edge_style` (default true, v1 no-op).
_Avoid_: Embedding this in LayoutConfig (that is a follow-up cross-cutting refactor)

**TreeLayoutResult**:
Shared output type for all non-hierarchical layout algorithms (Tree, Organic, Circular). Contains `vertices: Vec<(VertexId, Rect)>`, `edge_waypoints: Vec<(EdgeId, Vec<Point>)>`, and `group_rects: Vec<(GroupId, Rect)>`.
_Avoid_: Creating a separate CircularLayoutResult (that would add connascence with no benefit)

**compute_group_bboxes**:
Shared utility that computes group bounding boxes from vertex center positions. Called by tree (adjust_parents), organic, and circular layouts. Takes `(store, page_id, positions: &HashMap<VertexId, (f64, f64)>, group_padding)`.
_Avoid_: Implementing group bbox logic inside each layout algorithm

**LayoutDirection**:
Which way a hierarchical or grid layout flows. `TopToBottom` (default, layers stack downward) and `LeftToRight` (layers stack rightward, coordinates are swapped by `write_back`). Only `HierarchicalLayout` honors the field end-to-end; the other layouts read it but currently ignore it.
_Avoid_: Treating direction as a per-algorithm concept — it is a single `LayoutConfig.direction` field consumed differently per algorithm

**LayoutConfig**:
Configuration struct for the layout pipeline. Fields: `direction` (default `TopToBottom`), `intra_cell_spacing` (default 30.0), `inter_rank_spacing` (default 100.0), `max_iterations` (default 8). Uses `#[serde(default)]` on every field so an empty JSON `{}` is a valid input — that forgiveness lets the WASM boundary accept callers that have no knobs to set.
_Avoid_: Required-but-undocumented fields that fail deserialization silently when JS sends `{}` (the v0.77 incident with `direction`)

## Flagged Ambiguities

- **Editor vs Engine**: In this project, the editor is not the product core. The canonical term for the core product is **Diagram Engine**.
- **Port vs Rewrite**: In this project, the target is a **Semantic Port** with `.drawio Compatibility`, not a literal code translation and not a loose reinvention.
- **Behavior vs Source Code**: In this project, the contract comes from observable behavior and file semantics. The upstream JavaScript implementation is evidence, not authority.
- **Shell vs Application Logic**: In this project, the TypeScript layer is a **Web Shell**. Diagram state, editing rules, and compatibility behavior belong in the Diagram Engine.
- **Bridge Convenience vs Performance**: In this project, the `WASM Boundary` favors small commands, input events, and shared buffers over convenience-oriented object passing. Ease at the boundary must not create a permanent throughput bottleneck.
- **Redux Ideas vs Literal Redux**: In this project, Redux-like clarity is welcome at the `Command Flow` level, but the Diagram Engine is not a frontend-style reducer store. Internal state may stay mutable and optimized in Rust.
- **Render Technology vs Product Value**: In this project, render technology is not the product contract. A `Render Backend` serves the Diagram Engine and can evolve from SVG to WebGPU without changing the engine's semantics.
- **Menu Failure vs Visible Failure**: In this project, a WASM operation that returns `Err` must surface a visible diagnostics message — menu handlers that wrap engine calls are not allowed to discard the `Result`. The v0.77 layout bug stayed hidden for one full milestone because `editor.applyLayout()` returned `void` and the menu handler ignored the failure.

## Example Dialogue

Dev: We need undo/redo for the editor.
Domain Expert: Put that in the Diagram Engine, not in the editor shell.
Dev: So the editor just sends user intent?
Domain Expert: Exactly. The Diagram Engine owns the model and behavior; the editor is only one client of that engine.

Dev: Are we just building a new diagram tool inspired by draw.io?
Domain Expert: No. We are doing a Semantic Port.
Dev: Meaning we keep `.drawio` behavior compatible even if the internals are totally different?
Domain Expert: Exactly. Compatibility is part of the contract; the JavaScript architecture is not.

Dev: Should we reproduce `mxGraph` classes exactly?
Domain Expert: No. Preserve the Behavioral Reference.
Dev: So tests should assert behavior and round-trip semantics, not JS class parity?
Domain Expert: Exactly.

Dev: Should the frontend own editor state because it's the browser app?
Domain Expert: No. The Web Shell hosts the browser surface, but the Diagram Engine owns the diagram behavior and state.

Dev: Can we pass rich JS objects through wasm-bindgen to keep the bridge convenient?
Domain Expert: No. The WASM Boundary should carry small commands and shared buffers, not duplicate the model in JavaScript.
Dev: So JS sends intent and Rust keeps state?
Domain Expert: Exactly.

Dev: Should we implement the whole engine like literal Redux because the flow is clean?
Domain Expert: No. Keep the Command Flow, but let Rust use mutable optimized internals where performance matters.
Dev: So we keep determinism without turning the engine into reducer ceremony?
Domain Expert: Exactly.

Dev: Should we start with WebGPU because it sounds faster?
Domain Expert: No. Start with an SVG Render Backend and keep WebGPU as a later acceleration path.
Dev: So performance work starts in the model and scene generation, not in GPU hype?
Domain Expert: Exactly.
