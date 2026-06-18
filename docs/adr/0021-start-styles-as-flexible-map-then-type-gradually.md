# Start Styles as a Flexible Map, Then Type Gradually

The initial `diagram-core` model will represent styles as a controlled flexible property map rather than forcing a fully closed Rust type system from day one. The decision is to preserve early `.drawio` compatibility and round-trip fidelity across a long tail of style keys, while allowing the engine to progressively project frequently used or semantically important style properties into stronger Rust types where they materially improve rendering, routing, validation, or tooling.
