//! Slotmap-backed stores for pages, vertices, edges, groups, and styles.
//!
//! The engine uses [`slotmap`] because it provides stable, dense keys with
//! O(1) insertion, removal, and lookup. External IDs (e.g., `.drawio`
//! `id="..."` attributes) are stored alongside engine IDs in a separate
//! mapping owned by the format crate.
//!
//! See `docs/adr/0023-use-engine-owned-stable-ids-with-external-id-mapping.md`.

use crate::edge::Edge;
use crate::group::Group;
use crate::id::{EdgeId, GroupId, PageId, StyleId, VertexId};
use crate::page::Page;
use crate::style::StyleMap;
use crate::vertex::Vertex;
use slotmap::SlotMap;

/// All slotmap stores owned by the diagram model.
#[derive(Debug, Default)]
pub struct ModelStore {
    pages: SlotMap<PageId, Page>,
    vertices: SlotMap<VertexId, Vertex>,
    edges: SlotMap<EdgeId, Edge>,
    groups: SlotMap<GroupId, Group>,
    styles: SlotMap<StyleId, StyleMap>,
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
    pub fn vertex(&self, id: VertexId) -> Option<&Vertex> {
        self.vertices.get(id)
    }

    /// Look up a vertex by its engine ID (mutable).
    pub fn vertex_mut(&mut self, id: VertexId) -> Option<&mut Vertex> {
        self.vertices.get_mut(id)
    }

    /// Insert a vertex, returning its engine-assigned ID.
    pub fn insert_vertex(&mut self, v: Vertex) -> VertexId {
        self.vertices.insert(v)
    }

    /// Replace a vertex by its engine ID, returning the old value if present.
    pub fn replace_vertex(&mut self, id: VertexId, v: Vertex) -> Option<Vertex> {
        self.vertices
            .get_mut(id)
            .map(|old| std::mem::replace(old, v))
    }

    /// Number of vertices currently in the store.
    pub fn len_vertex(&self) -> usize {
        self.vertices.len()
    }

    /// Look up an edge by its engine ID.
    pub fn edge(&self, id: EdgeId) -> Option<&Edge> {
        self.edges.get(id)
    }

    /// Look up an edge by its engine ID (mutable).
    pub fn edge_mut(&mut self, id: EdgeId) -> Option<&mut Edge> {
        self.edges.get_mut(id)
    }

    /// Insert an edge, returning its engine-assigned ID.
    pub fn insert_edge(&mut self, e: Edge) -> EdgeId {
        self.edges.insert(e)
    }

    /// Replace an edge by its engine ID, returning the old value if present.
    pub fn replace_edge(&mut self, id: EdgeId, e: Edge) -> Option<Edge> {
        self.edges.get_mut(id).map(|old| std::mem::replace(old, e))
    }

    /// Remove an edge by its engine ID, returning the removed value if present.
    pub fn remove_edge(&mut self, id: EdgeId) -> Option<Edge> {
        self.edges.remove(id)
    }

    /// Number of edges currently in the store.
    pub fn len_edge(&self) -> usize {
        self.edges.len()
    }

    /// Look up a group by its engine ID.
    pub fn group(&self, id: GroupId) -> Option<&Group> {
        self.groups.get(id)
    }

    /// Look up a group by its engine ID (mutable).
    pub fn group_mut(&mut self, id: GroupId) -> Option<&mut Group> {
        self.groups.get_mut(id)
    }

    /// Insert a group, returning its engine-assigned ID.
    pub fn insert_group(&mut self, g: Group) -> GroupId {
        self.groups.insert(g)
    }

    /// Replace a group by its engine ID, returning the old value if present.
    pub fn replace_group(&mut self, id: GroupId, g: Group) -> Option<Group> {
        self.groups.get_mut(id).map(|old| std::mem::replace(old, g))
    }

    /// Number of groups currently in the store.
    pub fn len_group(&self) -> usize {
        self.groups.len()
    }

    /// Look up a style entry by its engine ID.
    pub fn style(&self, id: StyleId) -> Option<&StyleMap> {
        self.styles.get(id)
    }

    /// Insert a style entry, returning its engine-assigned ID.
    pub fn insert_style(&mut self, s: StyleMap) -> StyleId {
        self.styles.insert(s)
    }

    /// Number of style entries currently in the store.
    pub fn len_style(&self) -> usize {
        self.styles.len()
    }

    /// Iterate over all vertices (mutable), needed by format crates for testing.
    pub fn vertices_mut(&mut self) -> impl Iterator<Item = &mut Vertex> {
        self.vertices.values_mut()
    }

    /// Iterate over all edges (mutable), needed by format crates for testing.
    pub fn edges_mut(&mut self) -> impl Iterator<Item = &mut Edge> {
        self.edges.values_mut()
    }

    /// Iterate over all groups (mutable), needed by format crates for testing.
    pub fn groups_mut(&mut self) -> impl Iterator<Item = &mut Group> {
        self.groups.values_mut()
    }

    /// Iterate over all pages (mutable).
    pub fn pages_mut(&mut self) -> impl Iterator<Item = &mut Page> {
        self.pages.values_mut()
    }
}

#[cfg(test)]
mod tests {
    use crate::ModelStore;
    use crate::id::VertexId;
    use crate::vertex::Vertex;

    #[test]
    fn smoke_insert_lookup_replace() {
        let mut store = ModelStore::new();

        // Insert a vertex
        let v = Vertex::default();
        let vid = store.insert_vertex(v.clone());
        assert!(store.vertex(vid).is_some());
        assert_eq!(store.vertex(vid), Some(&v));
        assert_eq!(store.len_vertex(), 1);

        // Replace the vertex
        let v2 = Vertex {
            label: Some(crate::label::Label::new("test")),
            ..Default::default()
        };
        let old = store.replace_vertex(vid, v2.clone());
        assert_eq!(old, Some(v));
        assert_eq!(store.vertex(vid), Some(&v2));

        // Lookup non-existent
        let bogus = VertexId::default();
        assert!(store.vertex(bogus).is_none());
    }
}
