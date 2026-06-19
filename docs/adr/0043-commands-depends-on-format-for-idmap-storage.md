# ADR-0043: diagram-commands depends on diagram-format-drawio for IdMap storage

**Status**: Accepted

**Context**:
`export_drawio` requires the import-time `IdMap` (raw cell ID → engine ID mapping) to
reconstruct raw `.drawio` cell IDs during serialization. The `Editor` (in
`diagram-commands`) is the natural storage location because it already owns the
model lifecycle and is the single point of import/export in the WASM bridge.

This creates a `diagram-commands → diagram-format-drawio` dependency edge. Prior
to this change, `diagram-commands` depended only on `diagram-core`.

**Decision**:
Accept the `commands → format` dependency. Store `Option<IdMap>` as a concrete
field in `Editor` (Option A from the proposal), rather than introducing an
abstraction (trait in `diagram-core`, Option C) or duplicating the IdMap at the
WASM boundary (Option B).

**Rationale**:
1. **No cycle**: `format → core` only, so `commands → format → core` is a clean
   DAG. The dependency graph remains acyclic.
2. **ADR-0014 not violated**: ADR-0014 governs format's *outgoing* deps (only
   core), not incoming deps. Nothing in ADR-0014 prevents other crates from
   depending on format.
3. **ADR-0040 anticipates this**: ADR-0040 L36-37 explicitly states: *"if
   `diagram-format-drawio` gains downstream consumers beyond `diagram-wasm`,
   revisit with an ADR."* This ADR is that revisit.
4. **IdMap is pure data**: `IdMap` contains three `BTreeMap`s — no behavior, no
   trait methods. The Dependency Inversion Principle concern is moot.
5. **Single caller**: `Editor::replace_model` has exactly one caller
   (`import.rs:37`), verified via workspace grep. The signature change has zero
   silent-breakage risk.
6. **Option C (trait in core) would pollute `diagram-core`** with a
   single-consumer abstraction, contradicting ADR-0023's principle that the
   identity model should be kept independent of format concerns.

**Consequences**:
- `diagram-commands/Cargo.toml` gains `diagram-format-drawio` as a dependency.
- `Editor` struct gains `id_map: Option<IdMap>` (defaults to `None`).
- `replace_model` signature changes to accept `Option<IdMap>`.
- If `diagram-format-drawio` gains additional downstream consumers in the future,
   the dependency structure should be re-evaluated.

**Revisits**:
- ADR-0040 consequence: "if diagram-format-drawio gains downstream consumers,
   revisit with an ADR" — this is that revisit.

**References**:
- ADR-0014 (format depends only on core)
- ADR-0017 (thin WASM adapter)
- ADR-0023 (engine-owned stable IDs)
- ADR-0040 (WASM dep clarification)
