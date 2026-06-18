# Rust-Native Model with `.drawio` Mapping

Hodei Diagrams will use a Rust-native internal model and map it explicitly to and from `.drawio` structures instead of reproducing `mxGraphModel` and `mxCell` as the engine's core domain model. The decision is to preserve compatibility at the boundary while keeping the Diagram Engine free to optimize storage, indexing, commands, and rendering semantics for Rust rather than inheriting legacy implementation shapes.
