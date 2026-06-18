//! History for undo/redo tracking.
//!
//! Stores inverse-command entries. Undo/redo operations live in `Editor`.

use crate::Command;

/// History store for undo/redo entries.
///
/// Each entry is a `Vec<Command>` representing one atomic undo step
/// (e.g., a single command or a committed transaction).
#[derive(Debug)]
pub struct History {
    /// History entries, each entry = commands for one undo step.
    entries: Vec<Vec<Command>>,
    /// Cursor position: entries[0..cursor] are applied, entries[cursor..] are redo tail.
    cursor: usize,
}

impl History {
    /// Create a new empty history.
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
            cursor: 0,
        }
    }

    /// Push a new history entry, truncating any redo tail.
    ///
    /// If the entry count exceeds 10,000, emits a warning (advisory ceiling).
    pub fn push(&mut self, commands: Vec<Command>) {
        // Truncate redo tail
        self.entries.truncate(self.cursor);
        self.entries.push(commands);
        self.cursor += 1;

        // Advisory ceiling warning
        if self.entries.len() > 10_000 {
            eprintln!(
                "warning: history advisory ceiling exceeded ({} entries)",
                self.entries.len()
            );
        }
    }

    /// Pop the last applied entry for undoing (called by Editor).
    ///
    /// Returns the entry at `cursor - 1` and decrements cursor.
    /// Does NOT remove the entry from history — it stays for potential redo.
    pub(crate) fn pop_for_undo(&mut self) -> Option<Vec<Command>> {
        if self.cursor == 0 {
            return None;
        }
        self.cursor -= 1;
        // Return a clone; entry stays in entries for redo
        Some(self.entries[self.cursor].clone())
    }

    /// Take the entry at the current cursor for redo (called by Editor).
    ///
    /// Does NOT call apply on the commands — that lives in `Editor`.
    pub(crate) fn take_for_redo(&mut self) -> Option<Vec<Command>> {
        if self.cursor >= self.entries.len() {
            return None;
        }
        let entry = self.entries[self.cursor].clone();
        self.cursor += 1;
        Some(entry)
    }

    /// Check if undo is available.
    pub fn can_undo(&self) -> bool {
        self.cursor > 0
    }

    /// Check if redo is available.
    pub fn can_redo(&self) -> bool {
        self.cursor < self.entries.len()
    }

    /// Number of applied history entries.
    pub fn len(&self) -> usize {
        self.cursor
    }

    /// Returns true if history is empty.
    pub fn is_empty(&self) -> bool {
        self.cursor == 0
    }

    /// Total capacity (number of entries including redo tail).
    pub fn capacity(&self) -> usize {
        self.entries.len()
    }
}

impl Default for History {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::payload::AddVertexPayload;
    use diagram_core::geometry::CellGeometry;
    use diagram_core::label::Label;
    use diagram_core::{DiagramModel, Page, PageId, Vertex};

    fn make_page() -> (DiagramModel, PageId) {
        let mut model = DiagramModel::new();
        let page = Page::new(PageId::default());
        let pid = model.store.insert_page(page);
        if let Some(p) = model.store.page_mut(pid) {
            p.id = pid;
        }
        (model, pid)
    }

    fn make_cmd(pid: PageId) -> Command {
        let v = Vertex {
            geometry: Some(CellGeometry {
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 50.0,
                relative: false,
            }),
            label: Some(Label::new("Test")),
            page_id: Some(pid),
            ..Default::default()
        };
        Command::AddVertex(AddVertexPayload::new(v))
    }

    #[test]
    fn push_then_len() {
        let (_, pid) = make_page();
        let mut h = History::new();
        assert_eq!(h.len(), 0);

        h.push(vec![make_cmd(pid)]);
        assert_eq!(h.len(), 1);

        h.push(vec![make_cmd(pid)]);
        assert_eq!(h.len(), 2);

        h.push(vec![make_cmd(pid)]);
        assert_eq!(h.len(), 3);
    }

    #[test]
    fn push_truncates_redo_tail() {
        let (_, pid) = make_page();
        let mut h = History::new();

        h.push(vec![make_cmd(pid)]);
        h.push(vec![make_cmd(pid)]);
        h.push(vec![make_cmd(pid)]);
        assert_eq!(h.entries.len(), 3);
        assert_eq!(h.cursor, 3);

        // Simulate undo of entry 2: set cursor to 2
        h.cursor = 2;

        // Push a new entry — should truncate the old entry 2
        h.push(vec![make_cmd(pid)]);
        assert_eq!(h.entries.len(), 3); // not 4
        assert_eq!(h.cursor, 3);

        // Old redo tail is gone
        assert!(!h.can_redo());
    }

    #[test]
    fn can_undo_redo_reflects_cursor() {
        let (_, pid) = make_page();
        let mut h = History::new();

        assert!(!h.can_undo());
        assert!(!h.can_redo());

        h.push(vec![make_cmd(pid)]);
        assert!(h.can_undo());
        assert!(!h.can_redo());

        // Undo
        h.cursor = 0;
        assert!(!h.can_undo());
        assert!(h.can_redo());
    }

    #[test]
    fn pop_for_undo_decrements_cursor() {
        let (_, pid) = make_page();
        let mut h = History::new();
        h.push(vec![make_cmd(pid)]);
        h.push(vec![make_cmd(pid)]);
        assert_eq!(h.cursor, 2);

        let entry = h.pop_for_undo();
        assert!(entry.is_some());
        assert_eq!(h.cursor, 1);
        assert!(h.can_undo());
        assert!(h.can_redo());
    }

    #[test]
    fn take_for_redo_increments_cursor() {
        let (_, pid) = make_page();
        let mut h = History::new();
        h.push(vec![make_cmd(pid)]);
        h.push(vec![make_cmd(pid)]);
        // cursor at 2, nothing to redo

        h.cursor = 1; // undo one
        assert!(h.can_redo());

        let entry = h.take_for_redo();
        assert!(entry.is_some());
        assert_eq!(h.cursor, 2);
        assert!(!h.can_redo());
    }

    #[test]
    fn advisory_ceiling_no_crash() {
        let (_, pid) = make_page();
        let mut h = History::new();

        // Push enough to exceed 10K without crashing
        for _ in 0..10_005 {
            h.push(vec![make_cmd(pid)]);
        }
        assert!(h.len() > 10_000);
    }
}
