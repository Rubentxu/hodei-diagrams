//! Editor façade and Transaction builder.

use diagram_core::DiagramModel;

use crate::Command;
use crate::error::{CommandError, CommandResult};
use crate::history::History;
use crate::payload::{
    AddEdgePayload, AddGroupPayload, AddPagePayload, AddVertexPayload, ChangeStylePayload,
    EditLabelPayload, MoveVertexPayload, RemoveEdgePayload, RemoveGroupPayload, RemovePagePayload,
    RemoveVertexPayload, RenamePagePayload,
};
use diagram_core::{
    CellGeometry, Edge, EdgeId, Group, GroupId, Label, Page, PageId, StyleMap, Vertex, VertexId,
};

/// Editor façade for executing commands with undo/redo support.
#[derive(Debug)]
pub struct Editor {
    model: DiagramModel,
    history: History,
}

impl Editor {
    /// Create a new editor wrapping the given model.
    pub fn new(model: DiagramModel) -> Self {
        Self {
            model,
            history: History::new(),
        }
    }

    /// Alias for [`Editor::new`].
    pub fn from_model(model: DiagramModel) -> Self {
        Self::new(model)
    }

    /// Execute a single command.
    ///
    /// On success, pushes the command to history.
    /// On error, model is unchanged.
    pub fn execute(&mut self, mut cmd: Command) -> CommandResult<()> {
        cmd.apply(&mut self.model)?;
        self.history.push(vec![cmd]);
        Ok(())
    }

    /// Undo the last command (or transaction).
    ///
    /// No-op if undo is not available.
    pub fn undo(&mut self) -> CommandResult<()> {
        if !self.history.can_undo() {
            return Ok(());
        }

        let Some(mut commands) = self.history.pop_for_undo() else {
            return Ok(());
        };

        // Undo in reverse order
        for cmd in commands.iter_mut().rev() {
            cmd.undo(&mut self.model)?;
        }
        Ok(())
    }

    /// Redo the last undone command (or transaction).
    ///
    /// No-op if redo is not available.
    pub fn redo(&mut self) -> CommandResult<()> {
        if !self.history.can_redo() {
            return Ok(());
        }

        let commands = match self.history.take_for_redo() {
            Some(c) => c,
            None => return Ok(()),
        };

        // Redo in forward order
        for mut cmd in commands {
            cmd.apply(&mut self.model)?;
        }
        Ok(())
    }

    /// Borrow the model.
    pub fn model(&self) -> &DiagramModel {
        &self.model
    }

    /// Consume and return the model.
    pub fn into_model(self) -> DiagramModel {
        self.model
    }

    /// Check if undo is available.
    pub fn can_undo(&self) -> bool {
        self.history.can_undo()
    }

    /// Check if redo is available.
    pub fn can_redo(&self) -> bool {
        self.history.can_redo()
    }
}

/// Transaction builder for atomic multi-command operations.
///
/// Use `Transaction::new()` to build up commands, then `.commit(&mut editor)` to
/// apply them atomically. On error, all applied commands are rolled back.
#[derive(Debug, Default)]
pub struct Transaction {
    commands: Vec<Command>,
}

impl Transaction {
    /// Create a new empty transaction.
    pub fn new() -> Self {
        Self {
            commands: Vec::new(),
        }
    }

    /// Add a vertex to the transaction.
    pub fn add_vertex(mut self, v: Vertex) -> Self {
        self.commands
            .push(Command::AddVertex(AddVertexPayload::new(v)));
        self
    }

    /// Remove a vertex from the transaction.
    pub fn remove_vertex(mut self, id: VertexId) -> Self {
        self.commands
            .push(Command::RemoveVertex(RemoveVertexPayload::new(id)));
        self
    }

    /// Move a vertex in the transaction.
    pub fn move_vertex(mut self, id: VertexId, geometry: CellGeometry) -> Self {
        self.commands
            .push(Command::MoveVertex(MoveVertexPayload::new(id, geometry)));
        self
    }

    /// Edit a vertex label in the transaction.
    pub fn edit_vertex_label(self, id: VertexId, label: Label) -> Self {
        self.edit_vertex_label_impl(id, Some(label))
    }

    fn edit_vertex_label_impl(mut self, id: VertexId, label: Option<Label>) -> Self {
        self.commands
            .push(Command::EditVertexLabel(EditLabelPayload::new(id, label)));
        self
    }

    /// Edit a vertex label (allowing None to clear) in the transaction.
    pub fn edit_vertex_label_opt(self, id: VertexId, label: Option<Label>) -> Self {
        self.edit_vertex_label_impl(id, label)
    }

    /// Add an edge to the transaction.
    pub fn add_edge(mut self, edge: Edge) -> Self {
        self.commands
            .push(Command::AddEdge(AddEdgePayload::new(edge)));
        self
    }

    /// Remove an edge from the transaction.
    pub fn remove_edge(mut self, id: EdgeId) -> Self {
        self.commands
            .push(Command::RemoveEdge(RemoveEdgePayload::new(id)));
        self
    }

    /// Change a vertex style in the transaction.
    pub fn change_style(mut self, id: VertexId, style: StyleMap) -> Self {
        self.commands
            .push(Command::ChangeStyle(ChangeStylePayload::new(id, style)));
        self
    }

    /// Add a group to the transaction.
    pub fn add_group(mut self, g: Group) -> Self {
        self.commands
            .push(Command::AddGroup(AddGroupPayload::new(g)));
        self
    }

    /// Remove a group from the transaction.
    pub fn remove_group(mut self, id: GroupId) -> Self {
        self.commands
            .push(Command::RemoveGroup(RemoveGroupPayload::new(id)));
        self
    }

    /// Add a page to the transaction.
    pub fn add_page(mut self, p: Page) -> Self {
        self.commands.push(Command::AddPage(AddPagePayload::new(p)));
        self
    }

    /// Remove a page from the transaction.
    pub fn remove_page(mut self, id: PageId) -> Self {
        self.commands
            .push(Command::RemovePage(RemovePagePayload::new(id)));
        self
    }

    /// Rename a page in the transaction.
    pub fn rename_page(mut self, id: PageId, name: Label) -> Self {
        self.commands
            .push(Command::RenamePage(RenamePagePayload::new(id, name)));
        self
    }

    /// Commit the transaction atomically.
    ///
    /// On success, all commands are applied and pushed to history as one entry.
    /// On error, all applied commands are rolled back in reverse order and
    /// no history entry is pushed. Empty transactions succeed without pushing
    /// to history.
    pub fn commit(mut self, editor: &mut Editor) -> CommandResult<()> {
        let total = self.commands.len();

        // Empty transaction — nothing to do, don't push to history
        if total == 0 {
            return Ok(());
        }

        // Apply each command; rollback on error
        for i in 0..total {
            match self.commands[i].apply(&mut editor.model) {
                Ok(()) => {}
                Err(_) => {
                    // Rollback applied commands in reverse
                    for j in (0..i).rev() {
                        self.commands[j].undo(&mut editor.model)?;
                    }
                    return Err(CommandError::TransactionAborted { applied: i });
                }
            }
        }

        // All succeeded — push all commands as one history entry
        editor.history.push(std::mem::take(&mut self.commands));
        Ok(())
    }

    /// Number of pending commands in the transaction.
    pub fn pending(&self) -> usize {
        self.commands.len()
    }
}
