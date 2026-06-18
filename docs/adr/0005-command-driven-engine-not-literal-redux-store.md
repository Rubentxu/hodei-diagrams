# Command-Driven Engine, Not a Literal Redux Store

Hodei Diagrams will use explicit commands and unidirectional flow as the way user intent enters the Diagram Engine, but it will not implement the engine as a literal Redux-style reducer store. The decision is to keep the clarity, replayability, and testability of command-driven transitions while allowing mutable Rust internals, specialized stores, indexes, and caches that are better suited to high-performance diagram editing.
