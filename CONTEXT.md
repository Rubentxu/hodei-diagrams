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

## Flagged Ambiguities

- **Editor vs Engine**: In this project, the editor is not the product core. The canonical term for the core product is **Diagram Engine**.
- **Port vs Rewrite**: In this project, the target is a **Semantic Port** with `.drawio Compatibility`, not a literal code translation and not a loose reinvention.
- **Behavior vs Source Code**: In this project, the contract comes from observable behavior and file semantics. The upstream JavaScript implementation is evidence, not authority.
- **Shell vs Application Logic**: In this project, the TypeScript layer is a **Web Shell**. Diagram state, editing rules, and compatibility behavior belong in the Diagram Engine.
- **Bridge Convenience vs Performance**: In this project, the `WASM Boundary` favors small commands, input events, and shared buffers over convenience-oriented object passing. Ease at the boundary must not create a permanent throughput bottleneck.
- **Redux Ideas vs Literal Redux**: In this project, Redux-like clarity is welcome at the `Command Flow` level, but the Diagram Engine is not a frontend-style reducer store. Internal state may stay mutable and optimized in Rust.
- **Render Technology vs Product Value**: In this project, render technology is not the product contract. A `Render Backend` serves the Diagram Engine and can evolve from SVG to WebGPU without changing the engine's semantics.

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
