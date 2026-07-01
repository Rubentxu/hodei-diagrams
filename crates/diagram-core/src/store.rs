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
use crate::id::{EdgeId, GroupId, LayerId, PageId, StyleId, VertexId};
use crate::layer::Layer;
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
    layers: SlotMap<LayerId, Layer>,
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
        let id = self.pages.insert(page);
        if let Some(stored_page) = self.pages.get_mut(id) {
            stored_page.id = id;
        }
        id
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

    // ─── LAYER ACCESSORS ─────────────────────────────────────────────────────────

    /// Look up a layer by its engine ID.
    pub fn layer(&self, id: LayerId) -> Option<&Layer> {
        self.layers.get(id)
    }

    /// Look up a layer by its engine ID (mutable).
    pub fn layer_mut(&mut self, id: LayerId) -> Option<&mut Layer> {
        self.layers.get_mut(id)
    }

    /// Insert a layer, returning its engine-assigned ID.
    pub fn insert_layer(&mut self, l: Layer) -> LayerId {
        let id = self.layers.insert(l);
        if let Some(stored) = self.layers.get_mut(id) {
            stored.id = id;
        }
        id
    }

    /// Replace a layer by its engine ID, returning the old value if present.
    pub fn replace_layer(&mut self, id: LayerId, l: Layer) -> Option<Layer> {
        self.layers.get_mut(id).map(|old| std::mem::replace(old, l))
    }

    /// Remove a layer by its engine ID, returning the removed value if present.
    ///
    /// Does NOT cascade to vertices and edges that reference this layer.
    /// Consumers are responsible for orphaning shapes or moving them to the
    /// default layer.
    pub fn remove_layer(&mut self, id: LayerId) -> Option<Layer> {
        self.layers.remove(id)
    }

    /// Number of layers currently in the store.
    pub fn len_layer(&self) -> usize {
        self.layers.len()
    }

    /// Borrow all layers with their IDs in insertion order.
    pub fn layers_with_ids(&self) -> impl Iterator<Item = (LayerId, &Layer)> {
        self.layers.iter()
    }

    /// Iterate over all layers (mutable), needed by format crates for testing.
    pub fn layers_mut(&mut self) -> impl Iterator<Item = &mut Layer> {
        self.layers.values_mut()
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
        Vec<(LayerId, Layer)>,
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

        let layers: Vec<(LayerId, Layer)> = self
            .layers
            .iter()
            .filter(|(_, l)| l.page_id == page.id)
            .map(|(k, l)| (k, l.clone()))
            .collect();

        // Remove collected cells
        let vertex_ids: Vec<VertexId> = vertices.iter().map(|(k, _)| *k).collect();
        self.vertices.retain(|k, _| !vertex_ids.contains(&k));

        let edge_ids: Vec<EdgeId> = edges.iter().map(|(k, _)| *k).collect();
        self.edges.retain(|k, _| !edge_ids.contains(&k));

        let group_ids: Vec<GroupId> = groups.iter().map(|(k, _)| *k).collect();
        self.groups.retain(|k, _| !group_ids.contains(&k));

        let layer_ids: Vec<LayerId> = layers.iter().map(|(k, _)| *k).collect();
        self.layers.retain(|k, _| !layer_ids.contains(&k));

        Some((page, vertices, edges, groups, layers))
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

    // ─── Z-order helpers ───────────────────────────────────────────────────────

    /// Returns the maximum `z_order` value among all cells (vertices, edges,
    /// groups) on the given page.
    ///
    /// Returns `-1` if the page is empty, so that `max_z_order(page) + 1 == 0`
    /// for the first shape on an empty page.
    ///
    /// See ADR-0058 §Z-order semantics.
    pub fn max_z_order(&self, page_id: PageId) -> i32 {
        let mut max = -1;
        for (_, v) in self.vertices.iter() {
            if v.page_id == Some(page_id) && v.z_order > max {
                max = v.z_order;
            }
        }
        for (_, e) in self.edges.iter() {
            if e.page_id == Some(page_id) && e.z_order > max {
                max = e.z_order;
            }
        }
        for (_, g) in self.groups.iter() {
            if g.page_id == Some(page_id) && g.z_order > max {
                max = g.z_order;
            }
        }
        max
    }

    /// Returns the minimum `z_order` value among all cells (vertices, edges,
    /// groups) on the given page.
    ///
    /// Returns `0` if the page is empty (no sentinel needed; `min_z_order - 1`
    /// can be negative without issue).
    ///
    /// See ADR-0058 §Z-order semantics.
    pub fn min_z_order(&self, page_id: PageId) -> i32 {
        let mut min = i32::MAX;
        for (_, v) in self.vertices.iter() {
            if v.page_id == Some(page_id) && v.z_order < min {
                min = v.z_order;
            }
        }
        for (_, e) in self.edges.iter() {
            if e.page_id == Some(page_id) && e.z_order < min {
                min = e.z_order;
            }
        }
        for (_, g) in self.groups.iter() {
            if g.page_id == Some(page_id) && g.z_order < min {
                min = g.z_order;
            }
        }
        if min == i32::MAX {
            0 // page empty
        } else {
            min
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::ModelStore;
    use crate::edge::Edge;
    use crate::group::Group;
    use crate::id::{LayerId, PageId, VertexId};
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
        let v = Vertex {
            page_id: Some(pid),
            ..Default::default()
        };
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
        let g = Group {
            page_id: Some(pid),
            ..Default::default()
        };
        let _gid = store.insert_group(g.clone());

        // Insert layer L on page P
        let l = Layer::new(LayerId::default(), pid);
        let _lid = store.insert_layer(l);

        assert_eq!(store.page_count(), 1);
        assert_eq!(store.len_vertex(), 1);
        assert_eq!(store.len_edge(), 1);
        assert_eq!(store.len_group(), 1);
        assert_eq!(store.len_layer(), 1);

        // Remove page P — should cascade-remove all its cells
        let result = store.remove_page(pid);
        let (removed_page, removed_vertices, removed_edges, removed_groups, removed_layers) =
            result.expect("page should exist");

        assert_eq!(removed_page.id, pid);
        assert_eq!(removed_vertices.len(), 1);
        assert_eq!(removed_vertices[0].0, vid);
        assert_eq!(removed_edges.len(), 1);
        assert_eq!(removed_groups.len(), 1);
        assert_eq!(removed_layers.len(), 1);

        // Store is now empty
        assert_eq!(store.page_count(), 0);
        assert_eq!(store.len_vertex(), 0);
        assert_eq!(store.len_edge(), 0);
        assert_eq!(store.len_group(), 0);
        assert_eq!(store.len_layer(), 0);
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
        let v1 = Vertex {
            page_id: Some(pid1),
            ..Default::default()
        };
        let _vid1 = store.insert_vertex(v1);

        // Insert vertex V2 on page 2
        let v2 = Vertex {
            page_id: Some(pid2),
            ..Default::default()
        };
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

    #[test]
    fn group_default_layer_id_is_none() {
        let g = Group::default();
        assert!(g.layer_id.is_none());
    }

    #[test]
    fn group_layer_id_can_be_set() {
        let mut store = ModelStore::new();
        let layer = Layer::new(LayerId::default(), PageId::default());
        let lid = store.insert_layer(layer);
        let g = Group {
            layer_id: Some(lid),
            ..Default::default()
        };
        let gid = store.insert_group(g);
        assert_eq!(store.group(gid).unwrap().layer_id, Some(lid));
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
        // insert_page() normalizes Page.id to the assigned slotmap key
        assert_eq!(old.unwrap().id, pid);
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

    // ─── Z-order helpers ─────────────────────────────────────────────────────

    #[test]
    fn max_z_order_empty_page_returns_neg1() {
        let mut store = ModelStore::new();
        let page = Page::new(PageId::default());
        let pid = store.insert_page(page);
        // max of empty page should be -1 (so max+1 = 0 for first shape)
        assert_eq!(store.max_z_order(pid), -1);
    }

    #[test]
    fn max_z_order_scans_all_kinds() {
        let mut store = ModelStore::new();
        let page = Page::new(PageId::default());
        let pid = store.insert_page(page);

        // Insert vertex z=3
        let v = Vertex {
            z_order: 3,
            page_id: Some(pid),
            ..Default::default()
        };
        let _vid = store.insert_vertex(v);

        // Insert edge z=7
        let e = Edge {
            z_order: 7,
            page_id: Some(pid),
            source: VertexId::default(),
            target: VertexId::default(),
            ..Default::default()
        };
        let _eid = store.insert_edge(e);

        // Insert group z=10
        let g = Group {
            z_order: 10,
            page_id: Some(pid),
            ..Default::default()
        };
        let _gid = store.insert_group(g);

        assert_eq!(store.max_z_order(pid), 10);
    }

    #[test]
    fn max_z_order_filters_by_page() {
        let mut store = ModelStore::new();
        let page_a = Page::new(PageId::default());
        let pid_a = store.insert_page(page_a);
        let page_b = Page::new(PageId::default());
        let pid_b = store.insert_page(page_b);

        // Vertex on page A with z=5
        let v_a = Vertex {
            z_order: 5,
            page_id: Some(pid_a),
            ..Default::default()
        };
        store.insert_vertex(v_a);

        // Vertex on page B with z=99
        let v_b = Vertex {
            z_order: 99,
            page_id: Some(pid_b),
            ..Default::default()
        };
        store.insert_vertex(v_b);

        assert_eq!(store.max_z_order(pid_a), 5);
        assert_eq!(store.max_z_order(pid_b), 99);
    }

    #[test]
    fn max_z_order_includes_negative_values() {
        let mut store = ModelStore::new();
        let page = Page::new(PageId::default());
        let pid = store.insert_page(page);

        // Vertex with z=-3
        let v = Vertex {
            z_order: -3,
            page_id: Some(pid),
            ..Default::default()
        };
        store.insert_vertex(v);

        // Edge with z=0
        let e = Edge {
            z_order: 0,
            page_id: Some(pid),
            source: VertexId::default(),
            target: VertexId::default(),
            ..Default::default()
        };
        store.insert_edge(e);

        // max should be 0
        assert_eq!(store.max_z_order(pid), 0);
    }

    #[test]
    fn min_z_order_empty_page_returns_zero() {
        let mut store = ModelStore::new();
        let page = Page::new(PageId::default());
        let pid = store.insert_page(page);
        assert_eq!(store.min_z_order(pid), 0);
    }

    #[test]
    fn min_z_order_returns_smallest_including_negatives() {
        let mut store = ModelStore::new();
        let page = Page::new(PageId::default());
        let pid = store.insert_page(page);

        // Vertex with z=-5
        let v = Vertex {
            z_order: -5,
            page_id: Some(pid),
            ..Default::default()
        };
        store.insert_vertex(v);

        // Edge with z=3
        let e = Edge {
            z_order: 3,
            page_id: Some(pid),
            source: VertexId::default(),
            target: VertexId::default(),
            ..Default::default()
        };
        store.insert_edge(e);

        assert_eq!(store.min_z_order(pid), -5);
    }

    // ─── LAYER TESTS ────────────────────────────────────────────────────────────

    use crate::layer::Layer;

    #[test]
    fn layer_insert_lookup_replace() {
        let mut store = ModelStore::new();

        // Insert a layer
        let layer = Layer::default();
        let lid = store.insert_layer(layer);
        assert!(store.layer(lid).is_some());
        // The stored layer has id normalized to the slotmap key
        assert_eq!(store.layer(lid).unwrap().id, lid);
        assert_eq!(store.len_layer(), 1);

        // Replace the layer
        let layer2 = Layer {
            name: Some(crate::label::Label::new("Test Layer")),
            ..Default::default()
        };
        let old = store.replace_layer(lid, layer2.clone());
        // old has id normalized to slotmap key
        assert_eq!(old.as_ref().unwrap().id, lid);
        assert_eq!(store.layer(lid), Some(&layer2));

        // Lookup non-existent
        let bogus = crate::id::LayerId::default();
        assert!(store.layer(bogus).is_none());
    }

    #[test]
    fn layer_remove_returns_value() {
        let mut store = ModelStore::new();
        let layer = Layer::default();
        let lid = store.insert_layer(layer);
        let removed = store.remove_layer(lid);
        // removed has id normalized to slotmap key
        assert_eq!(removed.as_ref().unwrap().id, lid);
        assert_eq!(store.len_layer(), 0);
    }

    #[test]
    fn layer_remove_idempotent() {
        let mut store = ModelStore::new();
        let layer = Layer::default();
        let lid = store.insert_layer(layer);
        let first = store.remove_layer(lid);
        assert!(first.is_some());
        let second = store.remove_layer(lid);
        assert!(second.is_none());
    }

    #[test]
    fn layer_mut_allows_in_place_edit() {
        let mut store = ModelStore::new();
        let layer = Layer::default();
        let lid = store.insert_layer(layer);

        store.layer_mut(lid).unwrap().name = Some(crate::label::Label::new("renamed"));
        assert_eq!(
            store.layer(lid).unwrap().name.as_ref().unwrap().as_str(),
            "renamed"
        );
    }

    #[test]
    fn layers_with_ids_returns_all_layers() {
        let mut store = ModelStore::new();
        let layer1 = Layer::default();
        let layer2 = Layer::default();
        let lid1 = store.insert_layer(layer1);
        let lid2 = store.insert_layer(layer2);

        let ids: Vec<_> = store.layers_with_ids().map(|(id, _)| id).collect();
        assert!(ids.contains(&lid1));
        assert!(ids.contains(&lid2));
    }

    #[test]
    fn layers_mut_returns_mutable_layers() {
        let mut store = ModelStore::new();
        let layer = Layer::default();
        let lid = store.insert_layer(layer);

        for l in store.layers_mut() {
            l.name = Some(crate::label::Label::new("edited"));
        }
        assert_eq!(
            store.layer(lid).unwrap().name.as_ref().unwrap().as_str(),
            "edited"
        );
    }

    #[test]
    fn smoke_insert_mutate_remove_verify_no_layer() {
        let mut store = ModelStore::new();
        let layer = Layer::default();
        let lid = store.insert_layer(layer);
        store.layer_mut(lid).unwrap().name = Some(crate::label::Label::new("temp"));
        let removed = store.remove_layer(lid);
        assert!(removed.is_some());
        assert!(store.layer(lid).is_none());
    }
}
