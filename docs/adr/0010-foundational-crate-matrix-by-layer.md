# Foundational Crate Matrix by Layer

Hodei Diagrams will choose crates by architectural layer instead of accumulating general-purpose dependencies in the engine core. The decision is to keep the Diagram Engine lean, deterministic, and performance-oriented while reusing mature crates where they solve well-bounded problems such as `.drawio` parsing, stable identifiers, spatial indexing, graph algorithms, and WASM interop.

## Recommended Matrix

### `diagram-core`

- `thiserror` — typed library errors for core invariants and command failures
- `serde` — snapshots, fixtures, and stable debug serialization, not hot-path interaction
- `slotmap` — stable IDs for cells, pages, styles, and related stores
- `smallvec` — small inline collections such as waypoints, handles, and local adjacency data
- `bitflags` — compact modifier and engine state flags

### `diagram-format-drawio`

- `quick-xml` — primary XML parser/writer for `.drawio` and `mxGraphModel`
- `flate2` — compressed diagram payloads when needed by the format
- `base64` — encoded payload handling where required by import/export paths
- `serde` — fixtures and intermediate debug structures only where useful
- `thiserror` — typed format and compatibility errors

### `diagram-routing`

- `rstar` — spatial index for hit-testing, snap candidates, obstacle lookup, and routing support
- `pathfinding` — initial path search building block for orthogonal routing experiments
- `smallvec` — compact waypoint and candidate path storage
- `thiserror` — routing and constraint resolution errors where explicit reporting helps

### `diagram-layout`

- `petgraph` — graph algorithms and temporary algorithm views for layouts, not the domain source of truth
- `smallvec` — compact adjacency and layer-local structures
- `rayon` — optional native-only parallelism for heavy layout passes, feature-gated
- `thiserror` — layout computation errors where useful

### `diagram-render-svg`

- `smallvec` — compact render command fragments where beneficial
- `thiserror` — renderer-specific failures

SVG generation should stay mostly under project control because render semantics are part of the engine contract.

### `diagram-wasm`

- `wasm-bindgen` — exported engine boundary
- `js-sys` — JS typed array interop and low-level JS bindings
- `web-sys` — browser API access where the Web Shell cannot or should not own it
- `serde` — debug/import-export flows only, not interactive hot paths

### `diagram-render-wgpu` (later phase)

- `wgpu` — GPU abstraction for the accelerated backend
- `bytemuck` — safe plain-data casts for GPU buffers
- `encase` — structured buffer and uniform encoding

This layer is intentionally deferred until SVG-first compatibility and scene semantics are stable.

### `tooling` / `labs` / corpus work

- `anyhow` — ergonomic application-level errors
- `tracing` — structured diagnostics and instrumentation
- `tracing-subscriber` — local diagnostics setup
- `serde_json` — fixtures, reports, snapshots, and debug outputs
- `walkdir` — corpus traversal and tooling scans
- `ignore` — `.gitignore`-aware corpus and repository traversal
- `tempfile` — safe temporary working files in tests and import/export labs
- `rayon` — optional batch processing of corpora and regressions

## Not Recommended for the Core Right Now

- `dashmap` — conflicts with the current single-owner engine direction and adds concurrency complexity too early
- `arc-swap` — better suited to lock-free publication patterns than to the initial browser-first engine core
- `tokio` — useful for services and async tooling, not for the deterministic engine core
- `axum` — service-layer concern, outside the engine core
- `rmcp` — agent/service integration concern, outside the engine core
- `sqlx` — persistence/service concern, outside the engine core
- `serde_yaml` — only add if a real manifest/config need appears
- `notify` — useful later for watch-mode tooling, not foundational for the engine
- `bincode` — optional internal snapshot optimization later, not a primary architecture choice now
- `regex` — add case-by-case, not as a foundational dependency

## Guiding Rule

Use crates to avoid re-solving bounded infrastructure problems, but keep ownership of the Diagram Engine's semantic model, command flow, compatibility mapping, scene generation, and rendering semantics inside the project.
