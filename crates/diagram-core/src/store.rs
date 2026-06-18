//! Slotmap-backed stores for pages, vertices, edges, groups, and styles.
//!
//! The engine uses [`slotmap`] because it provides stable, dense keys with
//! O(1) insertion, removal, and lookup. External IDs (e.g., `.drawio`
//! `id="..."` attributes) are stored alongside engine IDs in a separate
//! mapping owned by the format crate.
//!
//! See `docs/adr/0023-use-engine-owned-stable-ids-with-external-id-mapping.md`.

use crate::id::{EdgeId, GroupId, PageId, StyleId, VertexId};
use crate::page::Page;
use slotmap::{SlotMap, new_key_type};

new_key_type! {
    /// Key for vertex slotmap entries.
    pub struct VertexKey;
    /// Key for edge slotmap entries.
    pub struct EdgeKey;
    /// Key for group slotmap entries.
    pub struct GroupKey;
    /// Key for style slotmap entries.
    pub struct StyleKey;
}

/// All slotmap stores owned by the diagram model.
#[derive(Debug, Default)]
pub struct ModelStore {
    pages: SlotMap<PageId, Page>,
    vertices: SlotMap<VertexId, ()>,
    edges: SlotMap<EdgeId, ()>,
    groups: SlotMap<GroupId, ()>,
    styles: SlotMap<StyleId, ()>,
}

impl ModelStore {
    /// Create a new, empty model store.
    pub fn new() -> Self {
        Self::default()
    }

    /// Borrow all pages in insertion order.
    pub fn pages(&self) -> impl Iterator<Item = &Page> {
        self.pages.values()
    }

    /// Number of pages currently in the store.
    pub fn page_count(&self) -> usize {
        self.pages.len()
    }

    /// Look up a page by its engine ID.
    pub fn page(&self, id: PageId) -> Option<&Page> {
        self.pages.get(id)
    }

    /// Insert a page, returning its engine-assigned ID.
    pub fn insert_page(&mut self, page: Page) -> PageId {
        self.pages.insert(page)
    }

    /// Look up a vertex by its engine ID.
    pub fn vertex(&self, id: VertexId) -> Option<()> {
        self.vertices.get(id).copied()
    }

    /// Insert a vertex placeholder, returning its engine-assigned ID.
    ///
    /// The actual vertex payload will be added alongside geometry, label, and
    /// style in subsequent revisions. For now the store keeps the slot open.
    pub fn insert_vertex(&mut self) -> VertexId {
        self.vertices.insert(())
    }

    /// Look up an edge by its engine ID.
    pub fn edge(&self, id: EdgeId) -> Option<()> {
        self.edges.get(id).copied()
    }

    /// Insert an edge placeholder, returning its engine-assigned ID.
    pub fn insert_edge(&mut self) -> EdgeId {
        self.edges.insert(())
    }

    /// Look up a group by its engine ID.
    pub fn group(&self, id: GroupId) -> Option<()> {
        self.groups.get(id).copied()
    }

    /// Insert a group placeholder, returning its engine-assigned ID.
    pub fn insert_group(&mut self) -> GroupId {
        self.groups.insert(())
    }

    /// Look up a style entry by its engine ID.
    pub fn style(&self, id: StyleId) -> Option<()> {
        self.styles.get(id).copied()
    }

    /// Insert a style entry placeholder, returning its engine-assigned ID.
    pub fn insert_style(&mut self) -> StyleId {
        self.styles.insert(())
    }
}