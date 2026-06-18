# Separate `diagram-core` from Commands and Keep Web Outside `crates/`

Hodei Diagrams will separate the domain model crate from command/history orchestration from the start, using distinct crates such as `diagram-core` and `diagram-commands` instead of merging both concerns. The web client will also live outside `crates/` in its own dedicated subdirectory so that browser-facing code remains an explicit adapter around the Rust workspace rather than becoming part of the engine core structure.
