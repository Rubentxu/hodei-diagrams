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

    /// Borrow all pages with their IDs in insertion order.
    pub fn pages_with_ids(&self) -> impl Iterator<Item = (PageId, &Page)> {
        self.pages.iter()
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

    /// Borrow all vertices with their IDs in insertion order.
    pub fn vertices_with_ids(&self) -> impl Iterator<Item = (VertexId, &Vertex)> {
        self.vertices.iter()
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

    /// Borrow all edges with their IDs in insertion order.
    pub fn edges_with_ids(&self) -> impl Iterator<Item = (EdgeId, &Edge)> {
        self.edges.iter()
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

    /// Borrow all groups with their IDs in insertion order.
    pub fn groups_with_ids(&self) -> impl Iterator<Item = (GroupId, &Group)> {
        self.groups.iter()
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

    // ─── REMOVE MUTATORS ───────────────────────────────────────────────────────

    /// Remove a vertex by its engine ID, returning the removed value if present.
    ///
    /// Does NOT cascade to edges that reference this vertex — consumers
    /// (commands) are responsible for explicit edge cleanup. This matches
    /// draw.io parity where removing a vertex leaves dangling edge references
    /// that must be resolved separately.
    pub fn remove_vertex(&mut self, id: VertexId) -> Option<Vertex> {
        self.vertices.remove(id)
    }

    /// Remove a group by its engine ID, returning the removed value if present.
    ///
    /// Does NOT cascade to vertices that have this group as their parent.
    /// Consumers are responsible for orphaning child vertices if needed.
    pub fn remove_group(&mut self, id: GroupId) -> Option<Group> {
        self.groups.remove(id)
    }

    /// Remove a style entry by its engine ID, returning the removed value if present.
    pub fn remove_style(&mut self, id: StyleId) -> Option<StyleMap> {
        self.styles.remove(id)
    }

    /// Remove a page and all cells that belong to it (cascade).
    ///
    /// Collects and removes all vertices, edges, and groups whose `page_id`
    /// field equals `Some(removed_page.id)`. The page itself is also removed.
    ///
    /// Returns `(page, vertices, edges, groups)` with the original items for
    /// undo reconstruction. The returned IDs are the **pre-removal** slotmap
    /// keys — they are stale after re-insertion; callers must build
    /// `old→new` ID maps if they intend to re-insert and rewrite references.
    #[allow(clippy::type_complexity)]
    pub fn remove_page(
        &mut self,
        id: PageId,
    ) -> Option<(
        Page,
        Vec<(VertexId, Vertex)>,
        Vec<(EdgeId, Edge)>,
        Vec<(GroupId, Group)>,
    )> {
        let page = self.pages.remove(id)?;

        // Collect cells belonging to this page
        let vertices: Vec<(VertexId, Vertex)> = self
            .vertices
            .iter()
            .filter(|(_, v)| v.page_id == Some(page.id))
            .map(|(k, v)| (k, v.clone()))
            .collect();

        let edges: Vec<(EdgeId, Edge)> = self
            .edges
            .iter()
            .filter(|(_, e)| e.page_id == Some(page.id))
            .map(|(k, e)| (k, e.clone()))
            .collect();

        let groups: Vec<(GroupId, Group)> = self
            .groups
            .iter()
            .filter(|(_, g)| g.page_id == Some(page.id))
            .map(|(k, g)| (k, g.clone()))
            .collect();

        // Remove collected cells
        let vertex_ids: Vec<VertexId> = vertices.iter().map(|(k, _)| *k).collect();
        self.vertices.retain(|k, _| !vertex_ids.contains(&k));

        let edge_ids: Vec<EdgeId> = edges.iter().map(|(k, _)| *k).collect();
        self.edges.retain(|k, _| !edge_ids.contains(&k));

        let group_ids: Vec<GroupId> = groups.iter().map(|(k, _)| *k).collect();
        self.groups.retain(|k, _| !group_ids.contains(&k));

        Some((page, vertices, edges, groups))
    }

    // ─── MUTABLE ACCESSORS ────────────────────────────────────────────────────

    /// Look up a page by its engine ID (mutable).
    pub fn page_mut(&mut self, id: PageId) -> Option<&mut Page> {
        self.pages.get_mut(id)
    }

    // ─── REPLACE MUTATORS ─────────────────────────────────────────────────────

    /// Replace a page by its engine ID, returning the old value if present.
    pub fn replace_page(&mut self, id: PageId, page: Page) -> Option<Page> {
        self.pages
            .get_mut(id)
            .map(|old| std::mem::replace(old, page))
    }

    /// Replace a style entry by its engine ID, returning the old value if present.
    pub fn replace_style(&mut self, id: StyleId, style: StyleMap) -> Option<StyleMap> {
        self.styles
            .get_mut(id)
            .map(|old| std::mem::replace(old, style))
    }
}

#[cfg(test)]
mod tests {
    use crate::ModelStore;
    use crate::edge::Edge;
    use crate::group::Group;
    use crate::id::PageId;
    use crate::id::VertexId;
    use crate::label::Label;
    use crate::page::Page;
    use crate::style::{StyleMap, StyleValue};
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
            label: Some(Label::new("test")),
            ..Default::default()
        };
        let old = store.replace_vertex(vid, v2.clone());
        assert_eq!(old, Some(v));
        assert_eq!(store.vertex(vid), Some(&v2));

        // Lookup non-existent
        let bogus = VertexId::default();
        assert!(store.vertex(bogus).is_none());
    }

    // ─── REMOVE MUTATORS ─────────────────────────────────────────────────────

    #[test]
    fn remove_vertex_returns_value() {
        let mut store = ModelStore::new();
        let v = Vertex::default();
        let vid = store.insert_vertex(v.clone());
        let removed = store.remove_vertex(vid);
        assert_eq!(removed, Some(v));
        assert_eq!(store.len_vertex(), 0);
    }

    #[test]
    fn remove_vertex_idempotent() {
        let mut store = ModelStore::new();
        let v = Vertex::default();
        let vid = store.insert_vertex(v);
        let first = store.remove_vertex(vid);
        assert!(first.is_some());
        let second = store.remove_vertex(vid);
        assert!(second.is_none());
    }

    #[test]
    fn remove_group_returns_value() {
        let mut store = ModelStore::new();
        let g = Group::default();
        let gid = store.insert_group(g.clone());
        let removed = store.remove_group(gid);
        assert_eq!(removed, Some(g));
        assert_eq!(store.len_group(), 0);
    }

    #[test]
    fn remove_style_returns_value() {
        let mut store = ModelStore::new();
        let s = StyleMap::new();
        let sid = store.insert_style(s.clone());
        let removed = store.remove_style(sid);
        assert_eq!(removed, Some(s));
        assert_eq!(store.len_style(), 0);
    }

    // ─── REMOVE PAGE CASCADE ──────────────────────────────────────────────────

    #[test]
    fn remove_page_cascades_children() {
        let mut store = ModelStore::new();

        // Insert page P — its internal id is PageId::default() at this point
        let page = Page::new(PageId::default());
        let pid = store.insert_page(page.clone());

        // Fix up Page.id to match the slotmap key (cascade filter uses page.id)
        let mut page_fixed = page.clone();
        page_fixed.id = pid;
        store.replace_page(pid, page_fixed);

        // Insert vertex V on page P
        let v = Vertex { page_id: Some(pid), ..Default::default() };
        let vid = store.insert_vertex(v.clone());

        // Insert edge E on page P
        let e = Edge {
            source: vid,
            target: vid,
            page_id: Some(pid),
            ..Default::default()
        };
        let _eid = store.insert_edge(e.clone());

        // Insert group G on page P
        let g = Group { page_id: Some(pid), ..Default::default() };
        let _gid = store.insert_group(g.clone());

        assert_eq!(store.page_count(), 1);
        assert_eq!(store.len_vertex(), 1);
        assert_eq!(store.len_edge(), 1);
        assert_eq!(store.len_group(), 1);

        // Remove page P — should cascade-remove all its cells
        let result = store.remove_page(pid);
        let (removed_page, removed_vertices, removed_edges, removed_groups) =
            result.expect("page should exist");

        assert_eq!(removed_page.id, pid);
        assert_eq!(removed_vertices.len(), 1);
        assert_eq!(removed_vertices[0].0, vid);
        assert_eq!(removed_edges.len(), 1);
        assert_eq!(removed_groups.len(), 1);

        // Store is now empty
        assert_eq!(store.page_count(), 0);
        assert_eq!(store.len_vertex(), 0);
        assert_eq!(store.len_edge(), 0);
        assert_eq!(store.len_group(), 0);
    }

    #[test]
    fn remove_page_leaves_other_pages_alone() {
        let mut store = ModelStore::new();

        // Insert two pages — use their slotmap keys as page IDs
        let page1 = Page::new(PageId::default());
        let pid1 = store.insert_page(page1.clone());
        let page2 = Page::new(PageId::default());
        let pid2 = store.insert_page(page2.clone());

        // Fix up page IDs so Page.id matches the slotmap key
        // (Page::new() uses PageId::default() which is wrong; fix via replace)
        let mut p1_fixed = page1.clone();
        p1_fixed.id = pid1;
        let mut p2_fixed = page2.clone();
        p2_fixed.id = pid2;
        store.replace_page(pid1, p1_fixed);
        store.replace_page(pid2, p2_fixed);

        // Insert vertex V1 on page 1
        let v1 = Vertex { page_id: Some(pid1), ..Default::default() };
        let _vid1 = store.insert_vertex(v1);

        // Insert vertex V2 on page 2
        let v2 = Vertex { page_id: Some(pid2), ..Default::default() };
        let _vid2 = store.insert_vertex(v2);

        assert_eq!(store.page_count(), 2);
        assert_eq!(store.len_vertex(), 2);

        // Remove page 1
        let result = store.remove_page(pid1);
        assert!(result.is_some());

        // Page 2 and V2 should remain
        assert_eq!(store.page_count(), 1);
        assert_eq!(store.len_vertex(), 1);
    }

    #[test]
    fn remove_page_no_match() {
        let mut store = ModelStore::new();
        let bogus = PageId::default();

        let result = store.remove_page(bogus);
        assert!(result.is_none());

        // Model unchanged
        assert_eq!(store.page_count(), 0);
    }

    // ─── MUTABLE ACCESSORS ────────────────────────────────────────────────────

    #[test]
    fn page_mut_allows_in_place_edit() {
        let mut store = ModelStore::new();
        let page = Page::new(PageId::default());
        let pid = store.insert_page(page);

        store.page_mut(pid).unwrap().name = Some(Label::new("renamed"));
        assert_eq!(
            store.page(pid).unwrap().name.as_ref().unwrap().as_str(),
            "renamed"
        );
    }

    #[test]
    fn vertex_mut_allows_in_place_edit() {
        let mut store = ModelStore::new();
        let v = Vertex::default();
        let vid = store.insert_vertex(v);

        store.vertex_mut(vid).unwrap().label = Some(Label::new("edited"));
        assert_eq!(
            store.vertex(vid).unwrap().label.as_ref().unwrap().as_str(),
            "edited"
        );
    }

    #[test]
    fn group_mut_allows_in_place_edit() {
        let mut store = ModelStore::new();
        let g = Group::default();
        let gid = store.insert_group(g);

        store.group_mut(gid).unwrap().label = Some(Label::new("group edited"));
        assert_eq!(
            store.group(gid).unwrap().label.as_ref().unwrap().as_str(),
            "group edited"
        );
    }

    // ─── REPLACE MUTATORS ─────────────────────────────────────────────────────

    #[test]
    fn replace_page_returns_old() {
        let mut store = ModelStore::new();
        let page = Page::new(PageId::default());
        let pid = store.insert_page(page.clone());

        let page2 = Page::new(store.page(pid).unwrap().id);
        let old = store.replace_page(pid, page2.clone());
        assert!(old.is_some());
        // Compare pages by id field only (Page doesn't implement PartialEq)
        assert_eq!(old.unwrap().id, page.id);
        assert_eq!(store.page(pid).unwrap().id, page2.id);
    }

    #[test]
    fn replace_style_returns_old() {
        let mut store = ModelStore::new();
        let s = StyleMap::new();
        let sid = store.insert_style(s.clone());

        let mut s2 = StyleMap::new();
        s2.insert("fillColor", StyleValue::from("red"));
        let old = store.replace_style(sid, s2.clone());
        assert_eq!(old, Some(s));
        assert_eq!(store.style(sid), Some(&s2));
    }

    // ─── SMOKE: INSERT → MUTATE → REMOVE → VERIFY NONE ───────────────────────

    #[test]
    fn smoke_insert_mutate_remove_verify_none() {
        let mut store = ModelStore::new();

        // Vertex
        let v = Vertex::default();
        let vid = store.insert_vertex(v);
        store.vertex_mut(vid).unwrap().label = Some(Label::new("temp"));
        let removed = store.remove_vertex(vid);
        assert!(removed.is_some());
        assert!(store.vertex(vid).is_none());

        // Edge
        let e = Edge::default();
        let eid = store.insert_edge(e);
        let removed = store.remove_edge(eid);
        assert!(removed.is_some());
        assert!(store.edge(eid).is_none());

        // Group
        let g = Group::default();
        let gid = store.insert_group(g);
        let removed = store.remove_group(gid);
        assert!(removed.is_some());
        assert!(store.group(gid).is_none());

        // Style
        let s = StyleMap::new();
        let sid = store.insert_style(s);
        let removed = store.remove_style(sid);
        assert!(removed.is_some());
        assert!(store.style(sid).is_none());

        // Page
        let p = Page::new(PageId::default());
        let pid = store.insert_page(p);
        let result = store.remove_page(pid);
        assert!(result.is_some());
        assert!(store.page(pid).is_none());
    }
}
