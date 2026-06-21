//! Scene builder: the pure function `&DiagramModel -> Result<Scene, SceneError>`.
//!
//! `SceneBuilder` walks the diagram model, resolves styles eagerly, flattens
//! geometry into page coordinates, and produces a `Scene` with nested elements.

use diagram_core::geometry::{Point as CorePoint, Rect as CoreRect, Size};
use diagram_core::{
    CellGeometry, DiagramModel, Edge, EdgeId, Group, GroupId, ModelStore, Page, StyleMap, Vertex,
    VertexId,
};

use crate::element::{
    CloudElement, CylinderElement, DEFAULT_ROUNDED_RADIUS, DiamondElement, EllipseElement,
    EntityId, GroupElement, HexagonElement, LineElement, ParallelogramElement, PolygonElement,
    RectElement, RoundedRectElement, TextElement, TrapezoidElement, TriangleElement, VisualElement,
};
use crate::error::{SceneError, SceneResult};
use crate::resolver::StyleResolver;
use crate::{PageScene, Scene};

/// The scene builder — constructs a `Scene` from a `DiagramModel`.
#[derive(Debug, Default)]
pub struct SceneBuilder {
    resolver: StyleResolver,
}

impl SceneBuilder {
    /// Creates a new `SceneBuilder`.
    pub fn new() -> Self {
        Self::default()
    }

    /// Builds a `Scene` from the given diagram model.
    ///
    /// This is a pure function — calling it twice with the same model
    /// produces byte-identical scenes.
    pub fn build(&self, model: &DiagramModel) -> SceneResult<Scene> {
        let store = &model.store;
        let mut pages: Vec<PageScene> = Vec::new();

        // Iterate pages in insertion order
        for (page_id, page) in store.pages_with_ids() {
            let page_scene = self.build_page(store, page_id, page)?;
            pages.push(page_scene);
        }

        Ok(Scene { pages })
    }

    /// Build a single page's scene.
    fn build_page(
        &self,
        store: &ModelStore,
        page_id: diagram_core::PageId,
        page: &Page,
    ) -> SceneResult<PageScene> {
        // Collect entries as (z_order, entity_kind, index, element) for stable sorting
        // entity_kind: 0=vertex, 1=vertex-text, 2=edge, 3=edge-text, 4=group
        let mut entries: Vec<(i32, u8, usize, VisualElement)> = Vec::new();
        let mut index = 0usize;

        // Top-level vertices: parent.is_none() AND page_id matches AND visible
        for (vid, vertex) in store.vertices_with_ids() {
            if vertex.page_id != Some(page_id) {
                continue;
            }
            if vertex.parent.is_some() {
                continue; // Will be nested under a group
            }
            if !vertex.visible {
                continue; // Hidden
            }

            let elem = self.project_vertex(store, vid, vertex, None)?;
            entries.push((vertex.z_order, 0, index, elem));
            index += 1;

            // Label projection
            if let Some(ref label) = vertex.label {
                let style_map = style_for(store, vertex.style_id);
                let style = self.resolver.resolve(&style_map);
                let anchor = self.vertex_top_left(store, vid)?;
                let text_elem = VisualElement::Text(TextElement {
                    owner: EntityId::Vertex(vid),
                    anchor,
                    text: label.text.clone(),
                    style,
                });
                entries.push((vertex.z_order, 1, index, text_elem));
                index += 1;
            }
        }

        // Top-level edges: page_id matches (edges don't have parent) AND visible
        for (eid, edge) in store.edges_with_ids() {
            if edge.page_id != Some(page_id) {
                continue;
            }
            if !edge.visible {
                continue; // Hidden
            }

            match self.project_edge(store, eid, edge) {
                Ok(elem) => {
                    entries.push((edge.z_order, 2, index, elem.clone()));
                    index += 1;

                    // Label projection for edge
                    if let Some(ref label) = edge.label {
                        let style_map = style_for(store, edge.style_id);
                        let style = self.resolver.resolve(&style_map);
                        // Anchor at midpoint of the edge
                        if let Ok(from_to) = self.edge_endpoints(store, edge) {
                            let anchor = CorePoint {
                                x: (from_to.0.x + from_to.1.x) / 2.0,
                                y: (from_to.0.y + from_to.1.y) / 2.0,
                            };
                            let text_elem = VisualElement::Text(TextElement {
                                owner: EntityId::Edge(eid),
                                anchor,
                                text: label.text.clone(),
                                style,
                            });
                            entries.push((edge.z_order, 3, index, text_elem));
                            index += 1;
                        }
                    }
                }
                Err(e) => return Err(e),
            }
        }

        // Top-level groups: page_id matches (groups don't have parent in v1) AND visible
        for (gid, group) in store.groups_with_ids() {
            if group.page_id != Some(page_id) {
                continue;
            }
            if !group.visible {
                continue; // Hidden group skips its entire subtree
            }

            let elem = self.project_group(store, gid, group, page_id)?;
            entries.push((group.z_order, 4, index, elem));
            index += 1;
        }

        // Sort by (z_order ASC, entity_kind ASC, index ASC)
        // Stable sort preserves insertion order for equal keys
        entries.sort_by(|a, b| {
            a.0.cmp(&b.0)
                .then_with(|| a.1.cmp(&b.1))
                .then_with(|| a.2.cmp(&b.2))
        });

        let display_list: Vec<VisualElement> =
            entries.into_iter().map(|(_, _, _, elem)| elem).collect();

        let name = page
            .name
            .as_ref()
            .map(|l| l.text.clone())
            .unwrap_or_default();

        Ok(PageScene {
            page_id,
            name,
            width: page.size.width,
            height: page.size.height,
            display_list,
        })
    }

    /// Project a vertex to a VisualElement.
    fn project_vertex(
        &self,
        store: &ModelStore,
        vid: VertexId,
        vertex: &Vertex,
        parent_geom: Option<&CellGeometry>,
    ) -> SceneResult<VisualElement> {
        let geometry = vertex.geometry.ok_or(SceneError::MissingGeometry(vid))?;

        let style_map = style_for(store, vertex.style_id);
        let kind = self.resolver.classify(&style_map);
        let resolved_style = self.resolver.resolve(&style_map);

        let bounds = page_coords(&geometry, parent_geom);

        match kind {
            crate::resolver::ShapeKind::Rect => Ok(VisualElement::Rect(RectElement {
                id: vid,
                bounds,
                rotation: geometry.rotation,
                flip_h: geometry.flip_h,
                flip_v: geometry.flip_v,
                style: resolved_style,
            })),
            crate::resolver::ShapeKind::RoundedRect => {
                Ok(VisualElement::RoundedRect(RoundedRectElement {
                    id: vid,
                    bounds,
                    radius: DEFAULT_ROUNDED_RADIUS,
                    rotation: geometry.rotation,
                    flip_h: geometry.flip_h,
                    flip_v: geometry.flip_v,
                    style: resolved_style,
                }))
            }
            crate::resolver::ShapeKind::Ellipse => Ok(VisualElement::Ellipse(EllipseElement {
                id: vid,
                bounds,
                rotation: geometry.rotation,
                flip_h: geometry.flip_h,
                flip_v: geometry.flip_v,
                style: resolved_style,
            })),
            crate::resolver::ShapeKind::Diamond => Ok(VisualElement::Diamond(DiamondElement {
                id: vid,
                bounds,
                rotation: geometry.rotation,
                flip_h: geometry.flip_h,
                flip_v: geometry.flip_v,
                style: resolved_style,
            })),
            crate::resolver::ShapeKind::Triangle => Ok(VisualElement::Triangle(TriangleElement {
                id: vid,
                bounds,
                rotation: geometry.rotation,
                flip_h: geometry.flip_h,
                flip_v: geometry.flip_v,
                style: resolved_style,
            })),
            crate::resolver::ShapeKind::Hexagon => Ok(VisualElement::Hexagon(HexagonElement {
                id: vid,
                bounds,
                rotation: geometry.rotation,
                flip_h: geometry.flip_h,
                flip_v: geometry.flip_v,
                style: resolved_style,
            })),
            crate::resolver::ShapeKind::Cylinder => Ok(VisualElement::Cylinder(CylinderElement {
                id: vid,
                bounds,
                rotation: geometry.rotation,
                flip_h: geometry.flip_h,
                flip_v: geometry.flip_v,
                style: resolved_style,
            })),
            crate::resolver::ShapeKind::Cloud => Ok(VisualElement::Cloud(CloudElement {
                id: vid,
                bounds,
                rotation: geometry.rotation,
                flip_h: geometry.flip_h,
                flip_v: geometry.flip_v,
                style: resolved_style,
            })),
            crate::resolver::ShapeKind::Parallelogram => {
                Ok(VisualElement::Parallelogram(ParallelogramElement {
                    id: vid,
                    bounds,
                    rotation: geometry.rotation,
                    flip_h: geometry.flip_h,
                    flip_v: geometry.flip_v,
                    style: resolved_style,
                }))
            }
            crate::resolver::ShapeKind::Trapezoid => {
                Ok(VisualElement::Trapezoid(TrapezoidElement {
                    id: vid,
                    bounds,
                    rotation: geometry.rotation,
                    flip_h: geometry.flip_h,
                    flip_v: geometry.flip_v,
                    style: resolved_style,
                }))
            }
            crate::resolver::ShapeKind::Polygon => {
                // For polygon, derive points from bounds as default
                // A simple quadrilateral approximating the bounds
                let points = vec![
                    CorePoint {
                        x: bounds.origin.x,
                        y: bounds.origin.y + bounds.size.height / 2.0,
                    },
                    CorePoint {
                        x: bounds.origin.x + bounds.size.width / 2.0,
                        y: bounds.origin.y,
                    },
                    CorePoint {
                        x: bounds.origin.x + bounds.size.width,
                        y: bounds.origin.y + bounds.size.height / 2.0,
                    },
                    CorePoint {
                        x: bounds.origin.x + bounds.size.width / 2.0,
                        y: bounds.origin.y + bounds.size.height,
                    },
                ];
                Ok(VisualElement::Polygon(PolygonElement {
                    id: vid,
                    points,
                    bounds,
                    rotation: geometry.rotation,
                    flip_h: geometry.flip_h,
                    flip_v: geometry.flip_v,
                    style: resolved_style,
                }))
            }
        }
    }

    /// Project an edge to a LineElement.
    fn project_edge(
        &self,
        store: &ModelStore,
        eid: EdgeId,
        edge: &Edge,
    ) -> SceneResult<VisualElement> {
        // Validate source and target exist (errors if not)
        let _source = store
            .vertex(edge.source)
            .ok_or(SceneError::DanglingEdgeSource(eid))?;
        let _target = store
            .vertex(edge.target)
            .ok_or(SceneError::DanglingEdgeTarget(eid))?;

        let from = self
            .vertex_center(store, edge.source)?
            .ok_or(SceneError::MissingGeometry(edge.source))?;
        let to = self
            .vertex_center(store, edge.target)?
            .ok_or(SceneError::MissingGeometry(edge.target))?;

        let style_map = style_for(store, edge.style_id);
        let resolved_style = self.resolver.resolve(&style_map);

        Ok(VisualElement::Line(LineElement {
            id: eid,
            from,
            to,
            style: resolved_style,
        }))
    }

    /// Project a group to a GroupElement with nested children.
    fn project_group(
        &self,
        store: &ModelStore,
        gid: GroupId,
        group: &Group,
        page_id: diagram_core::PageId,
    ) -> SceneResult<VisualElement> {
        let geometry = group
            .geometry
            .ok_or(SceneError::MissingGroupGeometry(gid))?;

        let style_map = style_for(store, group.style_id);
        let resolved_style = self.resolver.resolve(&style_map);

        let bounds = page_coords(&geometry, None);

        // Collect children: vertices with parent == gid
        let mut children: Vec<VisualElement> = Vec::new();

        for (vid, vertex) in store.vertices_with_ids() {
            if vertex.page_id != Some(page_id) {
                continue;
            }
            if vertex.parent != Some(gid) {
                continue;
            }

            let elem = self.project_vertex(store, vid, vertex, Some(&geometry))?;
            children.push(elem);

            // Label projection for child vertex
            if let Some(ref label) = vertex.label {
                let child_style_map = style_for(store, vertex.style_id);
                let child_style = self.resolver.resolve(&child_style_map);
                let anchor = self.vertex_top_left(store, vid)?;
                let text_elem = VisualElement::Text(TextElement {
                    owner: EntityId::Vertex(vid),
                    anchor,
                    text: label.text.clone(),
                    style: child_style,
                });
                children.push(text_elem);
            }
        }

        // Note: nested groups (groups inside groups) are not yet exercisable
        // because Group has no parent field in v1. This loop is here for
        // forward-compatibility when Group::parent is added.

        Ok(VisualElement::Group(GroupElement {
            id: gid,
            bounds,
            style: resolved_style,
            children,
            clip: true, // draw.io clips group children by default
        }))
    }

    /// Get the center point of a vertex in page coordinates.
    fn vertex_center(&self, store: &ModelStore, vid: VertexId) -> SceneResult<Option<CorePoint>> {
        let vertex = store.vertex(vid).ok_or(SceneError::MissingGeometry(vid))?;
        let geometry = match vertex.geometry {
            Some(g) => g,
            None => return Ok(None),
        };

        // For grouped vertices, we need to walk the parent chain
        let parent_geom = vertex
            .parent
            .and_then(|gid| store.group(gid).and_then(|g| g.geometry));
        let bounds = page_coords(&geometry, parent_geom.as_ref());

        Ok(Some(CorePoint {
            x: bounds.origin.x + bounds.size.width / 2.0,
            y: bounds.origin.y + bounds.size.height / 2.0,
        }))
    }

    /// Get the top-left point of a vertex in page coordinates.
    fn vertex_top_left(&self, store: &ModelStore, vid: VertexId) -> SceneResult<CorePoint> {
        let vertex = store.vertex(vid).ok_or(SceneError::MissingGeometry(vid))?;
        let geometry = match vertex.geometry {
            Some(g) => g,
            None => return Err(SceneError::MissingGeometry(vid)),
        };

        let parent_geom = vertex
            .parent
            .and_then(|gid| store.group(gid).and_then(|g| g.geometry));
        let bounds = page_coords(&geometry, parent_geom.as_ref());

        Ok(bounds.origin)
    }

    /// Get edge endpoints (from, to) in page coordinates.
    fn edge_endpoints(
        &self,
        store: &ModelStore,
        edge: &Edge,
    ) -> SceneResult<(CorePoint, CorePoint)> {
        let from = self
            .vertex_center(store, edge.source)?
            .ok_or(SceneError::MissingGeometry(edge.source))?;
        let to = self
            .vertex_center(store, edge.target)?
            .ok_or(SceneError::MissingGeometry(edge.target))?;
        Ok((from, to))
    }
}

// ─── Geometry flattening helpers ─────────────────────────────────────────────

/// Compute page coordinates from a cell geometry and optional parent geometry.
///
/// If `geom.relative == true` AND `parent_geom.is_some()`, the returned
/// origin is the parent origin plus the geometry offset. Otherwise the
/// returned origin is the geometry's own x/y (absolute or orphan relative).
fn page_coords(geom: &CellGeometry, parent_geom: Option<&CellGeometry>) -> CoreRect {
    let (x, y) = match (geom.relative, parent_geom) {
        (true, Some(p)) => (geom.x + p.x, geom.y + p.y),
        _ => (geom.x, geom.y), // absolute or orphan relative
    };

    CoreRect {
        origin: CorePoint { x, y },
        size: Size {
            width: geom.width,
            height: geom.height,
        },
    }
}

/// Get the style map for a style ID, or an empty map if none/dangling.
fn style_for(store: &ModelStore, style_id: Option<diagram_core::StyleId>) -> StyleMap {
    match style_id {
        Some(sid) => store.style(sid).cloned().unwrap_or_default(),
        None => StyleMap::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use diagram_core::label::Label;

    fn make_geom(x: f64, y: f64, w: f64, h: f64, relative: bool) -> CellGeometry {
        CellGeometry {
            x,
            y,
            width: w,
            height: h,
            relative,
            ..Default::default()
        }
    }

    #[test]
    fn build_empty_model_produces_empty_scene() {
        let model = DiagramModel::new();
        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();
        assert!(scene.pages.is_empty());
    }

    #[test]
    fn build_single_vertex() {
        let mut model = DiagramModel::new();

        // Insert a page first
        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        // Insert vertex with geometry
        let geom = make_geom(10.0, 20.0, 80.0, 40.0, false);
        let vertex = Vertex {
            geometry: Some(geom),
            page_id: Some(pid),
            ..Default::default()
        };
        let vid = model.store.insert_vertex(vertex);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        assert_eq!(scene.pages.len(), 1);
        let page_scene = &scene.pages[0];
        assert_eq!(page_scene.display_list.len(), 1);

        match &page_scene.display_list[0] {
            VisualElement::Rect(rect_elem) => {
                assert_eq!(rect_elem.id, vid);
                assert_eq!(rect_elem.bounds.origin.x, 10.0);
                assert_eq!(rect_elem.bounds.origin.y, 20.0);
                assert_eq!(rect_elem.bounds.size.width, 80.0);
                assert_eq!(rect_elem.bounds.size.height, 40.0);
            }
            _ => panic!("Expected Rect element"),
        }
    }

    #[test]
    fn build_relative_vertex_inside_group() {
        let mut model = DiagramModel::new();

        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        // Group at (10, 10, 200, 200)
        let group_geom = make_geom(10.0, 10.0, 200.0, 200.0, false);
        let group = Group {
            geometry: Some(group_geom),
            page_id: Some(pid),
            ..Default::default()
        };
        let gid = model.store.insert_group(group);

        // Vertex with parent=Some(gid) and relative=true, x=10, y=10
        let vertex_geom = make_geom(10.0, 10.0, 80.0, 40.0, true);
        let vertex = Vertex {
            geometry: Some(vertex_geom),
            parent: Some(gid),
            page_id: Some(pid),
            ..Default::default()
        };
        let _vid = model.store.insert_vertex(vertex);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        assert_eq!(scene.pages.len(), 1);
        let page_scene = &scene.pages[0];
        assert_eq!(page_scene.display_list.len(), 1);

        match &page_scene.display_list[0] {
            VisualElement::Group(group_elem) => {
                assert_eq!(group_elem.children.len(), 1);
                match &group_elem.children[0] {
                    VisualElement::Rect(rect_elem) => {
                        // Vertex origin should be (20, 20) = (10+10, 10+10)
                        assert_eq!(rect_elem.bounds.origin.x, 20.0);
                        assert_eq!(rect_elem.bounds.origin.y, 20.0);
                    }
                    _ => panic!("Expected Rect child"),
                }
            }
            _ => panic!("Expected Group element"),
        }
    }

    #[test]
    fn build_absolute_vertex_ignores_parent() {
        let mut model = DiagramModel::new();

        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        // Group at (10, 10, 200, 200)
        let group_geom = make_geom(10.0, 10.0, 200.0, 200.0, false);
        let group = Group {
            geometry: Some(group_geom),
            page_id: Some(pid),
            ..Default::default()
        };
        let gid = model.store.insert_group(group);

        // Vertex with parent=Some(gid) but relative=false (absolute)
        let vertex_geom = make_geom(10.0, 10.0, 80.0, 40.0, false);
        let vertex = Vertex {
            geometry: Some(vertex_geom),
            parent: Some(gid),
            page_id: Some(pid),
            ..Default::default()
        };
        let _vid = model.store.insert_vertex(vertex);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        let page_scene = &scene.pages[0];
        assert_eq!(page_scene.display_list.len(), 1);

        match &page_scene.display_list[0] {
            VisualElement::Group(group_elem) => {
                assert_eq!(group_elem.children.len(), 1);
                match &group_elem.children[0] {
                    VisualElement::Rect(rect_elem) => {
                        // Absolute: origin stays (10, 10), not (20, 20)
                        assert_eq!(rect_elem.bounds.origin.x, 10.0);
                        assert_eq!(rect_elem.bounds.origin.y, 10.0);
                    }
                    _ => panic!("Expected Rect child"),
                }
            }
            _ => panic!("Expected Group element"),
        }
    }

    #[test]
    fn build_edge_with_two_vertices() {
        let mut model = DiagramModel::new();

        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        // Vertex 1 at (40, 20) with size 80x40
        let geom1 = make_geom(40.0, 20.0, 80.0, 40.0, false);
        let v1 = Vertex {
            geometry: Some(geom1),
            page_id: Some(pid),
            ..Default::default()
        };
        let vid1 = model.store.insert_vertex(v1);

        // Vertex 2 at (120, 80) with size 80x40
        let geom2 = make_geom(120.0, 80.0, 80.0, 40.0, false);
        let v2 = Vertex {
            geometry: Some(geom2),
            page_id: Some(pid),
            ..Default::default()
        };
        let vid2 = model.store.insert_vertex(v2);

        // Edge between v1 and v2
        let edge = Edge {
            source: vid1,
            target: vid2,
            page_id: Some(pid),
            ..Default::default()
        };
        let _eid = model.store.insert_edge(edge);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        let page_scene = &scene.pages[0];
        assert_eq!(page_scene.display_list.len(), 3); // v1, v2, edge

        // Find the Line element
        let line_elem = page_scene
            .display_list
            .iter()
            .find_map(|e| match e {
                VisualElement::Line(le) => Some(le),
                _ => None,
            })
            .expect("Expected Line element");

        // Center of v1 = (40 + 80/2, 20 + 40/2) = (80, 40)
        assert_eq!(line_elem.from.x, 80.0);
        assert_eq!(line_elem.from.y, 40.0);

        // Center of v2 = (120 + 80/2, 80 + 40/2) = (160, 100)
        assert_eq!(line_elem.to.x, 160.0);
        assert_eq!(line_elem.to.y, 100.0);
    }

    #[test]
    fn build_group_nests_children() {
        let mut model = DiagramModel::new();

        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        // Group at (10, 10, 200, 200)
        let group_geom = make_geom(10.0, 10.0, 200.0, 200.0, false);
        let group = Group {
            geometry: Some(group_geom),
            page_id: Some(pid),
            ..Default::default()
        };
        let gid = model.store.insert_group(group);

        // Child 1
        let child1_geom = make_geom(20.0, 20.0, 50.0, 30.0, true);
        let child1 = Vertex {
            geometry: Some(child1_geom),
            parent: Some(gid),
            page_id: Some(pid),
            ..Default::default()
        };
        let _vid1 = model.store.insert_vertex(child1);

        // Child 2
        let child2_geom = make_geom(50.0, 50.0, 60.0, 40.0, true);
        let child2 = Vertex {
            geometry: Some(child2_geom),
            parent: Some(gid),
            page_id: Some(pid),
            ..Default::default()
        };
        let _vid2 = model.store.insert_vertex(child2);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        let page_scene = &scene.pages[0];
        assert_eq!(page_scene.display_list.len(), 1);

        match &page_scene.display_list[0] {
            VisualElement::Group(group_elem) => {
                assert_eq!(group_elem.children.len(), 2);
                assert!(group_elem.clip);
            }
            _ => panic!("Expected Group element"),
        }
    }

    #[test]
    fn build_vertex_with_label_projects_text() {
        let mut model = DiagramModel::new();

        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        let geom = make_geom(10.0, 20.0, 80.0, 40.0, false);
        let vertex = Vertex {
            geometry: Some(geom),
            label: Some(Label::new("hello")),
            page_id: Some(pid),
            ..Default::default()
        };
        let vid = model.store.insert_vertex(vertex);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        let page_scene = &scene.pages[0];
        // Should have 2 elements: Rect + Text
        assert_eq!(page_scene.display_list.len(), 2);

        match &page_scene.display_list[0] {
            VisualElement::Rect(rect_elem) => {
                assert_eq!(rect_elem.id, vid);
            }
            _ => panic!("Expected Rect first"),
        }

        match &page_scene.display_list[1] {
            VisualElement::Text(text_elem) => {
                assert_eq!(text_elem.text, "hello");
                assert_eq!(text_elem.owner, EntityId::Vertex(vid));
                assert_eq!(text_elem.anchor.x, 10.0);
                assert_eq!(text_elem.anchor.y, 20.0);
            }
            _ => panic!("Expected Text second"),
        }
    }

    #[test]
    fn build_preserves_z_order() {
        let mut model = DiagramModel::new();

        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        let geom = make_geom(0.0, 0.0, 50.0, 50.0, false);

        let v1 = Vertex {
            geometry: Some(CellGeometry {
                x: 0.0,
                y: 0.0,
                ..geom
            }),
            page_id: Some(pid),
            ..Default::default()
        };
        let v2 = Vertex {
            geometry: Some(CellGeometry {
                x: 10.0,
                y: 10.0,
                ..geom
            }),
            page_id: Some(pid),
            ..Default::default()
        };
        let v3 = Vertex {
            geometry: Some(CellGeometry {
                x: 20.0,
                y: 20.0,
                ..geom
            }),
            page_id: Some(pid),
            ..Default::default()
        };

        let _vid1 = model.store.insert_vertex(v1);
        let _vid2 = model.store.insert_vertex(v2);
        let _vid3 = model.store.insert_vertex(v3);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        let page_scene = &scene.pages[0];
        // All three vertices are top-level (no parent)
        assert_eq!(page_scene.display_list.len(), 3);

        // Check z-order by origin.x: v1=0, v2=10, v3=20
        match &page_scene.display_list[0] {
            VisualElement::Rect(r) => {
                assert_eq!(r.bounds.origin.x, 0.0, "First element should be v1");
            }
            _ => panic!("Expected Rect"),
        }
        match &page_scene.display_list[1] {
            VisualElement::Rect(r) => {
                assert_eq!(r.bounds.origin.x, 10.0, "Second element should be v2");
            }
            _ => panic!("Expected Rect"),
        }
        match &page_scene.display_list[2] {
            VisualElement::Rect(r) => {
                assert_eq!(r.bounds.origin.x, 20.0, "Third element should be v3");
            }
            _ => panic!("Expected Rect"),
        }
    }

    #[test]
    fn build_typed_id_propagation() {
        let mut model = DiagramModel::new();

        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        let geom = make_geom(0.0, 0.0, 50.0, 50.0, false);
        let vertex = Vertex {
            geometry: Some(geom),
            page_id: Some(pid),
            ..Default::default()
        };
        let vid = model.store.insert_vertex(vertex);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        let page_scene = &scene.pages[0];
        match &page_scene.display_list[0] {
            VisualElement::Rect(r) => {
                // The ID should be the typed VertexId, not a string
                assert_eq!(r.id, vid);
            }
            _ => panic!("Expected Rect"),
        }
    }

    #[test]
    fn build_missing_geometry_errors() {
        let mut model = DiagramModel::new();

        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        // Vertex WITHOUT geometry
        let vertex = Vertex {
            geometry: None,
            page_id: Some(pid),
            ..Default::default()
        };
        let vid = model.store.insert_vertex(vertex);

        let builder = SceneBuilder::new();
        let result = builder.build(&model);

        assert!(result.is_err());
        match result.unwrap_err() {
            SceneError::MissingGeometry(v) => assert_eq!(v, vid),
            _ => panic!("Expected MissingGeometry error"),
        }
    }

    #[test]
    fn build_dangling_edge_source_errors() {
        let mut model = DiagramModel::new();

        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        // Vertex 1 valid
        let geom = make_geom(0.0, 0.0, 50.0, 50.0, false);
        let v1 = Vertex {
            geometry: Some(geom),
            page_id: Some(pid),
            ..Default::default()
        };
        let vid1 = model.store.insert_vertex(v1);

        // Edge with dangling source (vid1 exists, but we use a fake source)
        let edge = Edge {
            source: VertexId::default(), // dangling
            target: vid1,
            page_id: Some(pid),
            ..Default::default()
        };
        let eid = model.store.insert_edge(edge);

        let builder = SceneBuilder::new();
        let result = builder.build(&model);

        assert!(result.is_err());
        match result.unwrap_err() {
            SceneError::DanglingEdgeSource(e) => assert_eq!(e, eid),
            _ => panic!("Expected DanglingEdgeSource error"),
        }
    }

    #[test]
    fn build_dangling_edge_target_errors() {
        let mut model = DiagramModel::new();

        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        // Vertex 1 valid
        let geom = make_geom(0.0, 0.0, 50.0, 50.0, false);
        let v1 = Vertex {
            geometry: Some(geom),
            page_id: Some(pid),
            ..Default::default()
        };
        let vid1 = model.store.insert_vertex(v1);

        // Edge with dangling target
        let edge = Edge {
            source: vid1,
            target: VertexId::default(), // dangling
            page_id: Some(pid),
            ..Default::default()
        };
        let eid = model.store.insert_edge(edge);

        let builder = SceneBuilder::new();
        let result = builder.build(&model);

        assert!(result.is_err());
        match result.unwrap_err() {
            SceneError::DanglingEdgeTarget(e) => assert_eq!(e, eid),
            _ => panic!("Expected DanglingEdgeTarget error"),
        }
    }

    #[test]
    fn build_vertex_rounded_style_produces_rounded_rect() {
        let mut model = DiagramModel::new();

        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        // Create a style with rounded=1
        let mut style_map = StyleMap::new();
        style_map.insert("rounded", "1");
        let style_id = model.store.insert_style(style_map);

        let geom = make_geom(0.0, 0.0, 50.0, 50.0, false);
        let vertex = Vertex {
            geometry: Some(geom),
            style_id: Some(style_id),
            page_id: Some(pid),
            ..Default::default()
        };
        let _vid = model.store.insert_vertex(vertex);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        let page_scene = &scene.pages[0];
        match &page_scene.display_list[0] {
            VisualElement::RoundedRect(r) => {
                assert_eq!(r.radius, DEFAULT_ROUNDED_RADIUS);
            }
            other => panic!("Expected RoundedRect, got {:?}", other),
        }
    }

    #[test]
    fn build_vertex_ellipse_style_produces_ellipse() {
        let mut model = DiagramModel::new();

        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        // Create a style with shape=ellipse
        let mut style_map = StyleMap::new();
        style_map.insert("shape", "ellipse");
        let style_id = model.store.insert_style(style_map);

        let geom = make_geom(0.0, 0.0, 50.0, 50.0, false);
        let vertex = Vertex {
            geometry: Some(geom),
            style_id: Some(style_id),
            page_id: Some(pid),
            ..Default::default()
        };
        let _vid = model.store.insert_vertex(vertex);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        let page_scene = &scene.pages[0];
        match &page_scene.display_list[0] {
            VisualElement::Ellipse(_) => {}
            other => panic!("Expected Ellipse, got {:?}", other),
        }
    }

    // ─── new shape kind tests ──────────────────────────────────────────────────

    #[test]
    fn build_vertex_diamond_style_produces_diamond() {
        let mut model = DiagramModel::new();
        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        let mut style_map = StyleMap::new();
        style_map.insert("shape", "diamond");
        let style_id = model.store.insert_style(style_map);

        let geom = make_geom(0.0, 0.0, 50.0, 50.0, false);
        let vertex = Vertex {
            geometry: Some(geom),
            style_id: Some(style_id),
            page_id: Some(pid),
            ..Default::default()
        };
        let _vid = model.store.insert_vertex(vertex);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        let page_scene = &scene.pages[0];
        match &page_scene.display_list[0] {
            VisualElement::Diamond(_) => {}
            other => panic!("Expected Diamond, got {:?}", other),
        }
    }

    #[test]
    fn build_vertex_triangle_style_produces_triangle() {
        let mut model = DiagramModel::new();
        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        let mut style_map = StyleMap::new();
        style_map.insert("shape", "triangle");
        let style_id = model.store.insert_style(style_map);

        let geom = make_geom(0.0, 0.0, 50.0, 50.0, false);
        let vertex = Vertex {
            geometry: Some(geom),
            style_id: Some(style_id),
            page_id: Some(pid),
            ..Default::default()
        };
        let _vid = model.store.insert_vertex(vertex);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        let page_scene = &scene.pages[0];
        match &page_scene.display_list[0] {
            VisualElement::Triangle(_) => {}
            other => panic!("Expected Triangle, got {:?}", other),
        }
    }

    #[test]
    fn build_vertex_hexagon_style_produces_hexagon() {
        let mut model = DiagramModel::new();
        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        let mut style_map = StyleMap::new();
        style_map.insert("shape", "hexagon");
        let style_id = model.store.insert_style(style_map);

        let geom = make_geom(0.0, 0.0, 50.0, 50.0, false);
        let vertex = Vertex {
            geometry: Some(geom),
            style_id: Some(style_id),
            page_id: Some(pid),
            ..Default::default()
        };
        let _vid = model.store.insert_vertex(vertex);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        let page_scene = &scene.pages[0];
        match &page_scene.display_list[0] {
            VisualElement::Hexagon(_) => {}
            other => panic!("Expected Hexagon, got {:?}", other),
        }
    }

    #[test]
    fn build_vertex_cylinder_style_produces_cylinder() {
        let mut model = DiagramModel::new();
        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        let mut style_map = StyleMap::new();
        style_map.insert("shape", "cylinder");
        let style_id = model.store.insert_style(style_map);

        let geom = make_geom(0.0, 0.0, 50.0, 50.0, false);
        let vertex = Vertex {
            geometry: Some(geom),
            style_id: Some(style_id),
            page_id: Some(pid),
            ..Default::default()
        };
        let _vid = model.store.insert_vertex(vertex);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        let page_scene = &scene.pages[0];
        match &page_scene.display_list[0] {
            VisualElement::Cylinder(_) => {}
            other => panic!("Expected Cylinder, got {:?}", other),
        }
    }

    #[test]
    fn build_vertex_cloud_style_produces_cloud() {
        let mut model = DiagramModel::new();
        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        let mut style_map = StyleMap::new();
        style_map.insert("shape", "cloud");
        let style_id = model.store.insert_style(style_map);

        let geom = make_geom(0.0, 0.0, 50.0, 50.0, false);
        let vertex = Vertex {
            geometry: Some(geom),
            style_id: Some(style_id),
            page_id: Some(pid),
            ..Default::default()
        };
        let _vid = model.store.insert_vertex(vertex);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        let page_scene = &scene.pages[0];
        match &page_scene.display_list[0] {
            VisualElement::Cloud(_) => {}
            other => panic!("Expected Cloud, got {:?}", other),
        }
    }

    #[test]
    fn build_vertex_parallelogram_style_produces_parallelogram() {
        let mut model = DiagramModel::new();
        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        let mut style_map = StyleMap::new();
        style_map.insert("shape", "parallelogram");
        let style_id = model.store.insert_style(style_map);

        let geom = make_geom(0.0, 0.0, 50.0, 50.0, false);
        let vertex = Vertex {
            geometry: Some(geom),
            style_id: Some(style_id),
            page_id: Some(pid),
            ..Default::default()
        };
        let _vid = model.store.insert_vertex(vertex);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        let page_scene = &scene.pages[0];
        match &page_scene.display_list[0] {
            VisualElement::Parallelogram(_) => {}
            other => panic!("Expected Parallelogram, got {:?}", other),
        }
    }

    #[test]
    fn build_vertex_trapezoid_style_produces_trapezoid() {
        let mut model = DiagramModel::new();
        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        let mut style_map = StyleMap::new();
        style_map.insert("shape", "trapezoid");
        let style_id = model.store.insert_style(style_map);

        let geom = make_geom(0.0, 0.0, 50.0, 50.0, false);
        let vertex = Vertex {
            geometry: Some(geom),
            style_id: Some(style_id),
            page_id: Some(pid),
            ..Default::default()
        };
        let _vid = model.store.insert_vertex(vertex);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        let page_scene = &scene.pages[0];
        match &page_scene.display_list[0] {
            VisualElement::Trapezoid(_) => {}
            other => panic!("Expected Trapezoid, got {:?}", other),
        }
    }

    #[test]
    fn build_vertex_polygon_style_produces_polygon() {
        let mut model = DiagramModel::new();
        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        let mut style_map = StyleMap::new();
        style_map.insert("shape", "polygon");
        let style_id = model.store.insert_style(style_map);

        let geom = make_geom(0.0, 0.0, 50.0, 50.0, false);
        let vertex = Vertex {
            geometry: Some(geom),
            style_id: Some(style_id),
            page_id: Some(pid),
            ..Default::default()
        };
        let _vid = model.store.insert_vertex(vertex);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        let page_scene = &scene.pages[0];
        match &page_scene.display_list[0] {
            VisualElement::Polygon(p) => {
                // Polygon should have 4 default points derived from bounds
                assert_eq!(p.points.len(), 4);
            }
            other => panic!("Expected Polygon, got {:?}", other),
        }
    }

    #[test]
    fn build_vertex_rhombus_alias_produces_diamond() {
        let mut model = DiagramModel::new();
        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        let mut style_map = StyleMap::new();
        style_map.insert("shape", "rhombus");
        let style_id = model.store.insert_style(style_map);

        let geom = make_geom(0.0, 0.0, 50.0, 50.0, false);
        let vertex = Vertex {
            geometry: Some(geom),
            style_id: Some(style_id),
            page_id: Some(pid),
            ..Default::default()
        };
        let _vid = model.store.insert_vertex(vertex);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        let page_scene = &scene.pages[0];
        match &page_scene.display_list[0] {
            VisualElement::Diamond(_) => {}
            other => panic!("Expected Diamond (from rhombus), got {:?}", other),
        }
    }

    #[test]
    fn build_style_resolution_applied() {
        let mut model = DiagramModel::new();

        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        // Create a style with known keys
        let mut style_map = StyleMap::new();
        style_map.insert("fillColor", "#dae8fc");
        style_map.insert("strokeColor", "#000000");
        style_map.insert("strokeWidth", "2");
        let style_id = model.store.insert_style(style_map);

        let geom = make_geom(0.0, 0.0, 50.0, 50.0, false);
        let vertex = Vertex {
            geometry: Some(geom),
            style_id: Some(style_id),
            page_id: Some(pid),
            ..Default::default()
        };
        let _vid = model.store.insert_vertex(vertex);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        let page_scene = &scene.pages[0];
        match &page_scene.display_list[0] {
            VisualElement::Rect(r) => {
                assert_eq!(r.style.fill_color.as_deref(), Some("#dae8fc"));
                assert_eq!(r.style.stroke_color.as_deref(), Some("#000000"));
                assert_eq!(r.style.stroke_width, Some(2.0));
                assert!(r.style.remaining.is_empty());
            }
            other => panic!("Expected Rect, got {:?}", other),
        }
    }

    #[test]
    fn build_page_without_name_has_empty_name() {
        let mut model = DiagramModel::new();
        let page = Page::new(diagram_core::PageId::default());
        let _pid = model.store.insert_page(page);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        assert_eq!(scene.pages[0].name, "");
    }

    #[test]
    fn build_page_with_name_has_correct_name() {
        let mut model = DiagramModel::new();

        let mut page = Page::new(diagram_core::PageId::default());
        page.name = Some(Label::new("My Page"));
        let pid = model.store.insert_page(page);

        let geom = make_geom(0.0, 0.0, 50.0, 50.0, false);
        let vertex = Vertex {
            geometry: Some(geom),
            page_id: Some(pid),
            ..Default::default()
        };
        model.store.insert_vertex(vertex);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        assert_eq!(scene.pages[0].name, "My Page");
    }

    #[test]
    fn page_coords_absolute() {
        let geom = make_geom(10.0, 20.0, 100.0, 50.0, false);
        let result = page_coords(&geom, None);

        assert_eq!(result.origin.x, 10.0);
        assert_eq!(result.origin.y, 20.0);
        assert_eq!(result.size.width, 100.0);
        assert_eq!(result.size.height, 50.0);
    }

    #[test]
    fn page_coords_relative_with_parent() {
        let parent = make_geom(100.0, 200.0, 500.0, 400.0, false);
        let child = make_geom(10.0, 30.0, 50.0, 25.0, true);
        let result = page_coords(&child, Some(&parent));

        assert_eq!(result.origin.x, 110.0); // 100 + 10
        assert_eq!(result.origin.y, 230.0); // 200 + 30
        assert_eq!(result.size.width, 50.0);
        assert_eq!(result.size.height, 25.0);
    }

    #[test]
    fn page_coords_relative_without_parent_is_absolute() {
        let child = make_geom(10.0, 30.0, 50.0, 25.0, true);
        let result = page_coords(&child, None);

        // Relative but no parent: behaves as absolute
        assert_eq!(result.origin.x, 10.0);
        assert_eq!(result.origin.y, 30.0);
    }
}
