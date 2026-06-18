# web-shell

TypeScript Web Shell for the Hodei Diagrams Diagram Engine.

This directory is intentionally **outside** the Rust workspace (`crates/`).
The Web Shell hosts browser integration concerns — DOM events, canvas/SVG
mounting, and editor chrome — and delegates diagram behavior and state
ownership to the Rust engine via WASM.

## Architecture Rules

- The Web Shell owns **no diagram state**.
- The Web Shell **never duplicates** the diagram model in JavaScript.
- The shell talks to the engine through small commands, input events, and
  shared buffers (the WASM Boundary).
- Render backends live in the Rust workspace, not here.

See `docs/adr/0002-typescript-web-shell-rust-engine.md` and
`docs/adr/0004-minimal-wasm-boundary-with-shared-buffers.md`.

## Status

Bootstrap skeleton. Real contents — `package.json`, bundler config, and the
mount/unmount entry point — are intentionally absent until the diagram-core
APIs settle.