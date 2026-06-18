# Multi-crate Workspace with Hexagonal Boundaries

Hodei Diagrams will start as a multi-crate Rust workspace organized under `crates/`, not as a single large crate to be split later. The decision is to express the system's architectural boundaries early using a Hexagonal/Clean Architecture mindset, so that the Diagram Engine core, `.drawio` compatibility, routing, layout, rendering, and WASM integration can evolve independently without collapsing into a monolithic crate with mixed responsibilities.
