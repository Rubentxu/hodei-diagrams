# ADR-0031: Command Shape and History Contract

## Status

Accepted

## Context

The `diagram-commands` crate implements reversible mutations for `DiagramModel`. We need to decide:

1. The shape of individual commands (enum vs trait object)
2. How history is stored (snapshots vs inverse commands)
3. How the editor façade exposes the model
4. How transactions group multiple commands atomically
5. Whether `RemoveGroup` orphans or cascades its children

These decisions interact: an enum-based command shape naturally pairs with inverse-command history, while a trait-based approach might prefer snapshots.

## Decision

We adopt the following decisions:

### 1. Command shape: closed `#[non_exhaustive] enum Command` with struct variants

```rust
#[derive(Debug, Clone)]
#[non_exhaustive]
pub enum Command {
    AddVertex(AddVertexPayload),
    RemoveVertex(RemoveVertexPayload),
    MoveVertex(MoveVertexPayload),
    EditVertexLabel(EditLabelPayload),
    AddEdge(AddEdgePayload),
    RemoveEdge(RemoveEdgePayload),
    ChangeStyle(ChangeStylePayload),
    AddGroup(AddGroupPayload),
    RemoveGroup(RemoveGroupPayload),
    AddPage(AddPagePayload),
    RemovePage(RemovePagePayload),
    RenamePage(RenamePagePayload),
}
```

Each payload is a named struct (not a tuple). This enables connascence-of-name rather than connascence-of-position.

### 2. History storage: inverse-commands (stored-in-payload)

`DiagramModel: !Clone` (slotmap-backed) makes snapshot history impossible. Instead, each payload stores forward data plus an `applied: bool` flag and inverse data slots populated by `apply` and consumed by `undo`:

```rust
pub struct MoveVertexPayload {
    pub id: VertexId,
    pub geometry: CellGeometry,       // forward data
    pub prev_geometry: Option<CellGeometry>, // inverse data (populated by apply)
    applied: bool,
}
```

Undo re-runs `apply` with the inverse data. Redo re-runs the forward apply. History stores `Vec<Command>` per undo step.

### 3. Editor façade: `Editor { model, history }`

The editor owns the model and history, exposing a minimal surface:

```rust
pub struct Editor {
    model: DiagramModel,
    history: History,
}

impl Editor {
    pub fn execute(&mut self, cmd: Command) -> CommandResult<()>;
    pub fn undo(&mut self) -> CommandResult<()>;
    pub fn redo(&mut self) -> CommandResult<()>;
    pub fn model(&self) -> &DiagramModel;
    pub fn into_model(self) -> DiagramModel;
}
```

### 4. Transaction model: freestanding builder

Transactions are a freestanding builder (not anchored to `Editor`), composable with `?`:

```rust
Transaction::new()
    .add_vertex(v1)
    .add_vertex(v2)
    .commit(&mut editor)?;  // atomic; rollback on Err
```

On `Err`, applied commands are undone in reverse order and no history entry is pushed.

### 5. `RemoveGroup` semantics: orphan children (no cascade)

Removing a group sets `vertex.parent = None` for its children (matching draw.io). The inverse operation restores the parent link with the new group ID.

## Alternatives Considered

### Box<dyn Command> trait object
- Enables open-ended command set
- Requires `dyn` allocations, `dyn Upcast`, serialization complexity
- Rejected: ADR-0012 requires minimal surface; `#[non_exhaustive]` provides extensibility without `dyn`

### Snapshot history
- Would clone `DiagramModel` on each mutation
- `DiagramModel: !Clone` (slotmap keys are not `Clone`)
- Rejected: technically impossible

### Per-cell memento
- Each cell stores its own undo history
- Couples history to domain model
- Rejected: mixes mutation tracking with domain model

## Consequences

- **Undo restores semantic equivalence, not identity**: slotmap keys are versioned and non-reusable. Undo of a removal re-inserts with NEW IDs. A reference-fixup pass rewrites `edge.source/target`, `vertex.parent`, and `cell.page_id` to the new IDs.
- **`RemovePage` cascade is an orphan, not a recursive delete**: the page and all its cells are removed together, but edge references are not pre-walked for cascade. The undo re-inserts page + all cells with new IDs.
- **`ChangeStyle` is vertex-scoped in v1**: edge/group/page style variants are deferred via `#[non_exhaustive]`.
- **History is unbounded in v1**: advisory log at 10,000 entries (no auto-truncation).

## References

- ADR-0012: Commands crate split from core
- ADR-0023: Engine-owned stable IDs
- ADR-0030: `page_id: Option<PageId>` on cells
