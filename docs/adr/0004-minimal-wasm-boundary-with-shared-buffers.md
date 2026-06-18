# Minimal WASM Boundary with Shared Buffers

Hodei Diagrams will use a narrow WASM Boundary based on small commands, input events, and shared buffers instead of passing rich JavaScript object graphs across the bridge. The decision is to keep state ownership inside the Rust Diagram Engine, reduce bridge overhead during interaction, and avoid a convenience-first API that would become a permanent performance bottleneck.
