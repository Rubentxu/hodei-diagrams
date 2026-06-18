# `diagram-format-drawio` Depends Only on `diagram-core`

The `.drawio` compatibility crate will depend only on `diagram-core` and not on `diagram-commands`, `diagram-layout`, or `diagram-routing`. The decision is to keep `.drawio` import/export as a boundary adapter over the core model rather than letting format concerns pull orchestration or algorithmic crates into the compatibility layer.
