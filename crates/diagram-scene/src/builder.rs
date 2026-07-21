//! Scene builder: the pure function `&DiagramModel -> Result<Scene, SceneError>`.
//!
//! `SceneBuilder` walks the diagram model, resolves styles eagerly, flattens
//! geometry into page coordinates, and produces a `Scene` with nested elements.
//!
//! # Math typesetting scope (per-page vs per-cell)
//!
//! Math rendering is page-scoped: `is_math` on each `TextElement` is set
//! directly from `page.math_enabled`. This matches the draw.io MVP and
//! keeps the Label type as a single owned String (no `Label::Math`
//! variant, which would churn every call site that constructs a label).
//!
//! The deferred enhancement is per-cell toggle ("disable math for this
//! vertex/edge"). When real users report they need per-cell control:
//!
//! 1. Add `math_opt_out: bool` (or `math_enabled: Option<bool>`) to
//!    `Vertex` and `Edge` in `diagram-core`. Default `false` preserves
//!    the page-scoped behavior for existing documents.
//! 2. Replace `is_math: page.math_enabled` with
//!    `is_math: page.math_enabled && !vertex.math_opt_out` at each
//!    call site below (3 occurrences: vertex label, edge label,
//!    edge-as-vertex label).
//! 3. Wire a UI affordance (e.g. right-click → "Render as plain text")
//!    that flips the new flag via a `SetVertexMathOptOut` command
//!    (mirror of `SetPageMathEnabled`).
//! 4. Extend the `.drawio` round-trip mapping in
//!    `crates/diagram-format-drawio` to read/write the per-cell flag
//!    on `<mxCell>` (e.g. via a style attribute or a dedicated attr).
//!
//! This is intentionally deferred until the trigger fires (user demand),
//! not implemented speculatively. The trade-off (per-cell boolean vs
//! `Label::Math` variant) is documented here so future work does not
//! re-litigate it.

use diagram_core::geometry::{Point as CorePoint, Rect as CoreRect, Size};
use diagram_core::{
    CellGeometry, DiagramModel, Edge, EdgeId, Group, GroupId, LayerId, ModelStore, Page, StyleMap,
    Vertex, VertexId,
};

use crate::element::{
    CloudElement, CylinderElement, DEFAULT_ROUNDED_RADIUS, DiamondElement, EllipseElement,
    EntityId, GroupElement, HexagonElement, LineElement, ParallelogramElement, PathElement,
    PolygonElement, RectElement, RoundedRectElement, StencilAspect, StencilElement, SwimlaneHeader,
    TextElement, TrapezoidElement, TriangleElement, VisualElement,
};
use crate::error::{SceneError, SceneResult};
use crate::resolver::StyleResolver;
use crate::stencil_provider::StencilProvider;
use crate::{PageScene, Scene};

/// The scene builder — constructs a `Scene` from a `DiagramModel`.
pub struct SceneBuilder {
    resolver: StyleResolver,
    stencil_provider: Option<Box<dyn StencilProvider>>,
}

impl Default for SceneBuilder {
    fn default() -> Self {
        Self {
            resolver: StyleResolver,
            stencil_provider: None,
        }
    }
}

impl std::fmt::Debug for SceneBuilder {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SceneBuilder")
            .field("resolver", &self.resolver)
            .finish_non_exhaustive()
    }
}

impl SceneBuilder {
    /// Creates a new `SceneBuilder`.
    pub fn new() -> Self {
        Self::default()
    }

    /// Attach an external stencil provider (e.g. WASM engine library cache).
    ///
    /// When set, the builder will use this provider as a fallback after the
    /// built-in `stencil_registry` lookup fails.
    pub fn with_stencil_provider(mut self, provider: Box<dyn StencilProvider>) -> Self {
        self.stencil_provider = Some(provider);
        self
    }

    /// Builds a `Scene` from the given diagram model.
    ///
    /// This is a pure function — calling it twice with the same model
    /// produces byte-identical scenes.
    pub fn build(&self, model: &DiagramModel) -> SceneResult<Scene> {
        let mut pages: Vec<PageScene> = Vec::new();

        // Iterate pages in display order (`page_order` if set, else slotmap order).
        for (page_id, page) in model.pages_in_order() {
            let page_scene = self.build_page(&model.store, page_id, page)?;
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
                continue; // Hidden (cell-level)
            }
            if is_layer_hidden(store, vertex.layer_id) {
                continue; // Hidden (layer-level)
            }

            let elem = self.project_vertex(store, vid, vertex, CorePoint { x: 0.0, y: 0.0 })?;
            entries.push((vertex.z_order, 0, index, elem));
            index += 1;

            // Label projection
            if let Some(ref label) = vertex.label {
                let style_map = style_for(store, vertex.style_id);
                let style = self.resolver.resolve(&style_map);
                let anchor = self.vertex_top_left(store, vid, CorePoint { x: 0.0, y: 0.0 })?;
                let text_elem = VisualElement::Text(TextElement {
                    owner: EntityId::Vertex(vid),
                    anchor,
                    text: label.text.clone(),
                    style,
                    // Math typesetting is page-scoped (matches draw.io MVP).
                    // Per-cell toggle (e.g. "disable math on this vertex")
                    // is intentionally deferred — see scene builder header
                    // for the trade-off rationale. When the trigger fires
                    // (real users asking for per-cell control), the change
                    // here is `page.math_enabled && !vertex.math_opt_out`.
                    is_math: page.math_enabled,
                });
                entries.push((vertex.z_order, 1, index, text_elem));
                index += 1;
            }
        }

        // Top-level edges: page_id matches (edges don't have parent) AND visible
        // An edge is included only if BOTH endpoints are on visible layers.
        for (eid, edge) in store.edges_with_ids() {
            if edge.page_id != Some(page_id) {
                continue;
            }
            if !edge.visible {
                continue; // Hidden
            }
            // Check both endpoints are on visible layers
            if is_layer_hidden(store, edge.layer_id) {
                continue; // Edge itself is on a hidden layer
            }
            let source_vertex = store.vertex(edge.source);
            let target_vertex = store.vertex(edge.target);
            let source_hidden = source_vertex
                .map(|v| is_layer_hidden(store, v.layer_id))
                .unwrap_or(false);
            let target_hidden = target_vertex
                .map(|v| is_layer_hidden(store, v.layer_id))
                .unwrap_or(false);
            if source_hidden || target_hidden {
                continue; // At least one endpoint is on a hidden layer
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
                            // Apply label offset if set
                            let anchor = match edge.label_offset {
                                Some((dx, dy)) => CorePoint {
                                    x: anchor.x + dx,
                                    y: anchor.y + dy,
                                },
                                None => anchor,
                            };
                            let text_elem = VisualElement::Text(TextElement {
                                owner: EntityId::Edge(eid),
                                anchor,
                                text: label.text.clone(),
                                style,
                                is_math: page.math_enabled,
                            });
                            entries.push((edge.z_order, 3, index, text_elem));
                            index += 1;
                        }
                    }
                }
                Err(e) => return Err(e),
            }
        }

        // Top-level groups: page_id matches AND parent.is_none() AND visible
        // Nested groups (e.g. swimlane lanes inside a pool) are projected as
        // children of their parent group, not as top-level entries.
        for (gid, group) in store.groups_with_ids() {
            if group.page_id != Some(page_id) {
                continue;
            }
            if group.parent.is_some() {
                continue; // Nested group — rendered inside its parent
            }
            if !group.visible {
                continue; // Hidden group skips its entire subtree
            }
            if is_layer_hidden(store, group.layer_id) {
                continue; // Hidden (layer-level) — skips entire subtree
            }

            let elem =
                self.project_group(store, gid, group, page_id, CorePoint { x: 0.0, y: 0.0 })?;
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
            background: page.background.clone(),
            math_enabled: page.math_enabled,
        })
    }

    /// Project a vertex to a VisualElement.
    ///
    /// `parent_offset` is the accumulated page origin of the vertex's enclosing
    /// group chain (for top-level vertices it is `(0, 0)`).
    fn project_vertex(
        &self,
        store: &ModelStore,
        vid: VertexId,
        vertex: &Vertex,
        parent_offset: CorePoint,
    ) -> SceneResult<VisualElement> {
        let geometry = vertex.geometry.ok_or(SceneError::MissingGeometry(vid))?;

        let style_map = style_for(store, vertex.style_id);
        let kind = self.resolver.classify(&style_map);
        let resolved_style = self.resolver.resolve(&style_map);

        let bounds = page_coords(&geometry, parent_offset);

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
            crate::resolver::ShapeKind::Stencil => {
                // Extract stencil ref from shape=stencil:<library>:<name> or stencil=<name>
                // The "builtin:" prefix is used for built-in stencils; absent prefix means built-in too.
                let (library, stencil_name) = resolved_style
                    .remaining
                    .get("shape")
                    .and_then(|v| {
                        let s = v.as_str();
                        if let Some(rest) = s.strip_prefix("stencil:") {
                            let parts: Vec<&str> = rest.split(':').collect();
                            if parts.len() >= 2 {
                                // stencil:<library>:<name>
                                Some((Some(parts[0].to_string()), parts[1].to_string()))
                            } else {
                                // stencil:<name> (built-in, no library)
                                Some((None, rest.to_string()))
                            }
                        } else {
                            None
                        }
                    })
                    .or_else(|| {
                        resolved_style
                            .remaining
                            .get("stencil")
                            .map(|v| (None, v.as_str().to_string()))
                    })
                    .unwrap_or((None, String::new()));

                let (aspect, bg, fg, resolved_library) =
                    if let Some(builtin_def) = crate::stencil_registry::lookup(&stencil_name) {
                        // Built-in stencil found
                        (
                            builtin_def.aspect,
                            builtin_def.background.to_vec(),
                            builtin_def.foreground.to_vec(),
                            "builtin".to_string(),
                        )
                    } else if library.is_some() {
                        // Not a built-in: try external provider (e.g. WASM XML library cache)
                        if let Some(ref provider) = self.stencil_provider {
                            if let Some((asp, bg_cmds, fg_cmds)) =
                                provider.lookup(library.as_deref().unwrap_or(""), &stencil_name)
                            {
                                (asp, bg_cmds, fg_cmds, library.clone().unwrap_or_default())
                            } else {
                                (
                                    StencilAspect::Variable,
                                    vec![],
                                    vec![],
                                    library.clone().unwrap_or_default(),
                                )
                            }
                        } else {
                            (
                                StencilAspect::Variable,
                                vec![],
                                vec![],
                                library.clone().unwrap_or_default(),
                            )
                        }
                    } else {
                        // Built-in not found, no library specified
                        (
                            StencilAspect::Variable,
                            vec![],
                            vec![],
                            "builtin".to_string(),
                        )
                    };

                Ok(VisualElement::Stencil(StencilElement {
                    id: vid,
                    library: resolved_library,
                    name: stencil_name,
                    bounds,
                    aspect,
                    background: bg,
                    foreground: fg,
                    rotation: geometry.rotation,
                    flip_h: geometry.flip_h,
                    flip_v: geometry.flip_v,
                    style: resolved_style,
                }))
            }
            crate::resolver::ShapeKind::Image => {
                Ok(VisualElement::Image(crate::element::ImageElement {
                    id: vid,
                    bounds,
                    image_src: resolved_style.image_src.clone(),
                    aspect: crate::element::ImageAspect::Contain,
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

        if edge.waypoints.is_empty() {
            Ok(VisualElement::Line(LineElement {
                id: eid,
                from,
                to,
                style: resolved_style,
            }))
        } else {
            // Waypoints are interior-only (draw.io XML `<Array as="points">`
            // convention + insert_bend/move_bend/remove_bend strip endpoints).
            // Materialise the perimeter-inclusive path so every consumer (SVG
            // renderer, bend overlay, hit-testing) sees a connected path from
            // source to target. v1 uses vertex centers; anchor-aware perimeter
            // projection (exitX/entryY) is r111+. See ADR-0083.
            let mut points = Vec::with_capacity(edge.waypoints.len() + 2);
            points.push(from);
            points.extend(edge.waypoints.iter().copied());
            points.push(to);
            Ok(VisualElement::Path(PathElement {
                id: eid,
                points,
                style: resolved_style,
            }))
        }
    }

    /// Project a group to a GroupElement with nested children.
    ///
    /// `parent_offset` is the accumulated page origin of any enclosing group.
    /// For top-level groups (pools) this is `(0, 0)`.
    fn project_group(
        &self,
        store: &ModelStore,
        gid: GroupId,
        group: &Group,
        page_id: diagram_core::PageId,
        parent_offset: CorePoint,
    ) -> SceneResult<VisualElement> {
        let geometry = group
            .geometry
            .ok_or(SceneError::MissingGroupGeometry(gid))?;

        // Look up the page to get math_enabled for child label projections.
        // The page must exist since build_page already validated it.
        let page = store.page(page_id).expect("page must exist in store");

        let style_map = style_for(store, group.style_id);
        let resolved_style = self.resolver.resolve(&style_map);

        // Compute group bounds in page coordinates
        let group_offset = if geometry.relative {
            CorePoint {
                x: parent_offset.x + geometry.x,
                y: parent_offset.y + geometry.y,
            }
        } else {
            CorePoint {
                x: geometry.x,
                y: geometry.y,
            }
        };
        let bounds = CoreRect {
            origin: group_offset,
            size: Size {
                width: geometry.width,
                height: geometry.height,
            },
        };

        // Compute swimlane header only for top-level swimlane groups (pools).
        // Nested swimlane groups (lanes inside pools, parent=Some) do NOT get a header.
        let header = if group.parent.is_none() {
            self.compute_swimlane_header(&style_map, &bounds)
        } else {
            None
        };

        // Collect child vertices
        let mut children: Vec<VisualElement> = Vec::new();

        for (vid, vertex) in store.vertices_with_ids() {
            if vertex.page_id != Some(page_id) {
                continue;
            }
            if vertex.parent != Some(gid) {
                continue;
            }
            if !vertex.visible {
                continue; // Hidden (cell-level)
            }
            if is_layer_hidden(store, vertex.layer_id) {
                continue; // Hidden (layer-level) — child vertex on a hidden layer
            }

            let elem = self.project_vertex(store, vid, vertex, group_offset)?;
            children.push(elem);

            // Label projection for child vertex
            if let Some(ref label) = vertex.label {
                let child_style_map = style_for(store, vertex.style_id);
                let child_style = self.resolver.resolve(&child_style_map);
                let anchor = self.vertex_top_left(store, vid, group_offset)?;
                let text_elem = VisualElement::Text(TextElement {
                    owner: EntityId::Vertex(vid),
                    anchor,
                    text: label.text.clone(),
                    style: child_style,
                    is_math: page.math_enabled,
                });
                children.push(text_elem);
            }
        }

        // Recurse into nested child groups (e.g. swimlane lanes inside a pool)
        for (child_gid, child_group) in store.groups_with_ids() {
            if child_group.page_id != Some(page_id) {
                continue;
            }
            if child_group.parent != Some(gid) {
                continue;
            }
            if !child_group.visible {
                continue;
            }
            if is_layer_hidden(store, child_group.layer_id) {
                continue; // Hidden (layer-level) — entire child group subtree skipped
            }
            // `group_offset` is THIS group's page origin (the parent of the
            // children we are about to recurse into). Pass it as
            // `parent_offset` so the recursive `project_group` call adds the
            // child's geometry to it correctly.
            let child_elem =
                self.project_group(store, child_gid, child_group, page_id, group_offset)?;
            children.push(child_elem);
        }

        Ok(VisualElement::Group(GroupElement {
            id: gid,
            bounds,
            style: resolved_style,
            children,
            clip: true, // draw.io clips group children by default
            header,
        }))
    }

    /// Compute the swimlane header from `startSize` and `horizontal` style keys.
    ///
    /// Returns `None` if the group is not a swimlane (style does not contain
    /// the substring `"swimlane"`).
    fn compute_swimlane_header(
        &self,
        style_map: &StyleMap,
        group_bounds: &CoreRect,
    ) -> Option<SwimlaneHeader> {
        // Only groups with "swimlane" in the style are swimlanes
        if !style_map.iter().any(|(k, _)| k == "swimlane") {
            return None;
        }

        let horizontal = style_map
            .get("horizontal")
            .map(|v| v.as_str() == "1" || v.as_str().to_lowercase() == "true")
            .unwrap_or(false);

        let start_size = style_map
            .get("startSize")
            .and_then(|v| v.as_str().parse::<f64>().ok())
            .unwrap_or(40.0);

        let header_bounds = if horizontal {
            // Vertical strip on the left edge
            CoreRect {
                origin: group_bounds.origin,
                size: Size {
                    width: start_size,
                    height: group_bounds.size.height,
                },
            }
        } else {
            // Horizontal band at the top edge
            CoreRect {
                origin: group_bounds.origin,
                size: Size {
                    width: group_bounds.size.width,
                    height: start_size,
                },
            }
        };

        Some(SwimlaneHeader {
            bounds: header_bounds,
            horizontal,
        })
    }

    /// Get the center point of a vertex in page coordinates.
    ///
    /// Used for edge endpoints — always computes the absolute page position
    /// by walking the full parent group chain.
    fn vertex_center(&self, store: &ModelStore, vid: VertexId) -> SceneResult<Option<CorePoint>> {
        let vertex = store.vertex(vid).ok_or(SceneError::MissingGeometry(vid))?;
        let geometry = match vertex.geometry {
            Some(g) => g,
            None => return Ok(None),
        };

        // Walk the full parent group chain to compute accumulated offset
        let parent_offset = compute_parent_offset(store, vertex.parent)?;
        let bounds = page_coords(&geometry, parent_offset);

        Ok(Some(CorePoint {
            x: bounds.origin.x + bounds.size.width / 2.0,
            y: bounds.origin.y + bounds.size.height / 2.0,
        }))
    }

    /// Get the top-left point of a vertex in page coordinates.
    ///
    /// When `parent_offset` is provided (from `project_group`), it is used
    /// directly. When called from `build_page` for top-level vertices, pass
    /// `(0, 0)`.
    fn vertex_top_left(
        &self,
        store: &ModelStore,
        vid: VertexId,
        parent_offset: CorePoint,
    ) -> SceneResult<CorePoint> {
        let vertex = store.vertex(vid).ok_or(SceneError::MissingGeometry(vid))?;
        let geometry = match vertex.geometry {
            Some(g) => g,
            None => return Err(SceneError::MissingGeometry(vid)),
        };

        let bounds = page_coords(&geometry, parent_offset);

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

// ─── Layer visibility helpers ─────────────────────────────────────────────────

/// Returns `true` if the given `layer_id` resolves to a hidden layer.
///
/// - `layer_id = None` → default layer → always visible → returns `false`
/// - `layer_id = Some(LayerId)` → look up the layer; if it exists and `visible == false` → returns `true`
/// - Unknown layer ID → returns `false` (defensive: treat unknown layers as visible)
fn is_layer_hidden(store: &ModelStore, layer_id: Option<LayerId>) -> bool {
    match layer_id {
        Some(lid) => store
            .layer(lid)
            .map(|layer| !layer.visible)
            .unwrap_or(false),
        None => false, // default layer is always visible
    }
}

// ─── Geometry flattening helpers ─────────────────────────────────────────────

/// Compute page coordinates from a cell geometry and an accumulated parent offset.
///
/// If `geom.relative == true`, the returned origin is `parent_offset + geom.x/y`.
/// Otherwise it is just `geom.x/y` (absolute geometry).
///
/// `parent_offset` is the accumulated page origin of the enclosing group chain.
/// For top-level vertices it is `(0, 0)`.
fn page_coords(geom: &CellGeometry, parent_offset: CorePoint) -> CoreRect {
    let (x, y) = if geom.relative {
        (geom.x + parent_offset.x, geom.y + parent_offset.y)
    } else {
        (geom.x, geom.y)
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

/// Compute the accumulated page offset by walking the full parent group chain.
///
/// For a vertex nested N levels deep (group → group → ... → vertex), this
/// sums the x/y offsets of all enclosing groups that have `relative=true`.
fn compute_parent_offset(
    store: &ModelStore,
    mut parent: Option<diagram_core::GroupId>,
) -> SceneResult<CorePoint> {
    let mut offset = CorePoint { x: 0.0, y: 0.0 };
    while let Some(gid) = parent {
        let group = store
            .group(gid)
            .ok_or(SceneError::MissingGroupGeometry(gid))?;
        if let Some(ref geom) = group.geometry {
            if geom.relative {
                offset.x += geom.x;
                offset.y += geom.y;
            }
        }
        parent = group.parent;
    }
    Ok(offset)
}

#[cfg(test)]
mod tests {
    use super::*;
    use diagram_core::label::Label;
    use diagram_core::{Layer, LayerId};

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

    // =============================================================================
    // Task 2.3 — Swimlane nested projection: pool → lane → shape
    // =============================================================================

    #[test]
    fn build_swimlane_nested_pool_lane_shape() {
        // Simulates the swimlane-pool-lane.drawio fixture:
        //   pool  at (10, 10, 700, 400)  — top-level group, parent=None
        //   lane  at (0, 0, 700, 120)     — child group of pool, relative=true
        //   shape at (20, 40, 120, 60)   — child vertex of lane, relative=true
        //
        // Accumulated page coords for shape: pool_origin + lane_origin + shape_origin
        // = (10+0+20, 10+0+40) = (30, 50)
        let mut model = DiagramModel::new();

        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        // Pool (top-level group, parent=None)
        let mut pool_style = StyleMap::new();
        pool_style.insert(
            "swimlane".to_owned(),
            diagram_core::StyleValue(String::new()),
        );
        let pool_style_id = model.store.insert_style(pool_style);
        let pool_geom = make_geom(10.0, 10.0, 700.0, 400.0, false);
        let pool = Group {
            geometry: Some(pool_geom),
            style_id: Some(pool_style_id),
            page_id: Some(pid),
            parent: None,
            ..Default::default()
        };
        let pool_gid = model.store.insert_group(pool);

        // Lane (nested group, parent=pool_gid, relative within pool)
        let lane_geom = make_geom(0.0, 0.0, 700.0, 120.0, true);
        let lane = Group {
            geometry: Some(lane_geom),
            style_id: Some(pool_style_id),
            page_id: Some(pid),
            parent: Some(pool_gid),
            ..Default::default()
        };
        let lane_gid = model.store.insert_group(lane);

        // Shape (child vertex of lane)
        let shape_geom = make_geom(20.0, 40.0, 120.0, 60.0, true);
        let shape = Vertex {
            geometry: Some(shape_geom),
            style_id: None,
            page_id: Some(pid),
            parent: Some(lane_gid),
            ..Default::default()
        };
        let _shape_vid = model.store.insert_vertex(shape);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        assert_eq!(scene.pages.len(), 1);
        let page_scene = &scene.pages[0];

        // Only pool appears in display list (lane is nested inside it, shape is nested inside lane)
        assert_eq!(page_scene.display_list.len(), 1, "only pool is top-level");

        let pool_elem = match &page_scene.display_list[0] {
            VisualElement::Group(g) => g,
            other => panic!("Expected top-level Group (pool), got {:?}", other),
        };

        // Pool has swimlane header
        assert!(
            pool_elem.header.is_some(),
            "pool must have a SwimlaneHeader"
        );
        let pool_header = pool_elem.header.as_ref().unwrap();
        // Default startSize=40, horizontal=false → header is top band (700×40)
        assert_eq!(pool_header.bounds.size.width, 700.0);
        assert_eq!(pool_header.bounds.size.height, 40.0);
        assert!(
            !pool_header.horizontal,
            "pool should be vertical (horizontal=false)"
        );

        // Pool has one child: the lane (nested group)
        assert_eq!(
            pool_elem.children.len(),
            1,
            "pool must have exactly one child (the lane)"
        );

        let lane_elem = match &pool_elem.children[0] {
            VisualElement::Group(g) => g,
            other => panic!("Expected nested Group (lane), got {:?}", other),
        };

        // Lane has no header (it's not a swimlane itself — only pools are)
        assert!(
            lane_elem.header.is_none(),
            "lane should not have a SwimlaneHeader"
        );

        // Lane has one child: the shape
        assert_eq!(
            lane_elem.children.len(),
            1,
            "lane must have exactly one child (the shape)"
        );

        let shape_elem = match &lane_elem.children[0] {
            VisualElement::Rect(r) => r,
            other => panic!("Expected Rect (shape), got {:?}", other),
        };

        // Shape accumulated coords: pool(10,10) + lane(0,0) + shape(20,40) = (30, 50)
        assert_eq!(shape_elem.bounds.origin.x, 30.0);
        assert_eq!(shape_elem.bounds.origin.y, 50.0);
        assert_eq!(shape_elem.bounds.size.width, 120.0);
        assert_eq!(shape_elem.bounds.size.height, 60.0);
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
    fn build_edge_with_waypoints_produces_perimeter_inclusive_path() {
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

        // v1 center = (40 + 80/2, 20 + 40/2) = (80, 40)
        // v2 center = (120 + 80/2, 80 + 40/2) = (160, 100)
        let waypoints = vec![
            diagram_core::geometry::Point { x: 100.0, y: 50.0 },
            diagram_core::geometry::Point { x: 100.0, y: 70.0 },
        ];
        let edge = Edge {
            source: vid1,
            target: vid2,
            page_id: Some(pid),
            waypoints,
            ..Default::default()
        };
        model.store.insert_edge(edge);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        let page_scene = &scene.pages[0];
        assert_eq!(page_scene.display_list.len(), 3); // v1, v2, edge

        // Find the Path element
        let path_elem = page_scene
            .display_list
            .iter()
            .find_map(|e| match e {
                VisualElement::Path(pe) => Some(pe),
                _ => None,
            })
            .expect("Expected Path element");

        // Perimeter-inclusive: from + 2 waypoints + to = 4 points
        // v1 center = (80, 40), v2 center = (160, 100)
        assert_eq!(path_elem.points.len(), 4, "from + 2 waypoints + to");
        assert_eq!(path_elem.points[0].x, 80.0);  // from (v1 center)
        assert_eq!(path_elem.points[0].y, 40.0);
        assert_eq!(path_elem.points[1].x, 100.0); // wp[0]
        assert_eq!(path_elem.points[1].y, 50.0);
        assert_eq!(path_elem.points[2].x, 100.0); // wp[1]
        assert_eq!(path_elem.points[2].y, 70.0);
        assert_eq!(path_elem.points[3].x, 160.0); // to (v2 center)
        assert_eq!(path_elem.points[3].y, 100.0);
    }

    #[test]
    fn build_edge_with_empty_waypoints_produces_line_element() {
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

        // Edge with empty waypoints (backward compat)
        let edge = Edge {
            source: vid1,
            target: vid2,
            page_id: Some(pid),
            waypoints: vec![],
            ..Default::default()
        };
        model.store.insert_edge(edge);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        let page_scene = &scene.pages[0];

        // Should produce LineElement, not PathElement
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
    fn build_vertex_image_style_produces_image_element() {
        let mut model = DiagramModel::new();
        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        let mut style_map = StyleMap::new();
        style_map.insert("shape", "image");
        style_map.insert("image", "https://example.com/logo.png");
        let style_id = model.store.insert_style(style_map);

        let geom = make_geom(10.0, 20.0, 80.0, 60.0, false);
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
            VisualElement::Image(img) => {
                assert_eq!(
                    img.image_src,
                    Some("https://example.com/logo.png".to_owned())
                );
                assert_eq!(img.bounds.origin.x, 10.0);
                assert_eq!(img.bounds.origin.y, 20.0);
                assert_eq!(img.bounds.size.width, 80.0);
                assert_eq!(img.bounds.size.height, 60.0);
            }
            other => panic!("Expected Image, got {:?}", other),
        }
    }

    #[test]
    fn build_vertex_image_missing_src_uses_placeholder() {
        let mut model = DiagramModel::new();
        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        let mut style_map = StyleMap::new();
        style_map.insert("shape", "image");
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
            VisualElement::Image(img) => {
                assert_eq!(img.image_src, None);
            }
            other => panic!("Expected Image, got {:?}", other),
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
        let parent_offset = CorePoint { x: 0.0, y: 0.0 };
        let result = page_coords(&geom, parent_offset);

        assert_eq!(result.origin.x, 10.0);
        assert_eq!(result.origin.y, 20.0);
        assert_eq!(result.size.width, 100.0);
        assert_eq!(result.size.height, 50.0);
    }

    #[test]
    fn page_coords_relative_with_parent() {
        let parent_offset = CorePoint { x: 100.0, y: 200.0 };
        let child = make_geom(10.0, 30.0, 50.0, 25.0, true);
        let result = page_coords(&child, parent_offset);

        assert_eq!(result.origin.x, 110.0); // 100 + 10
        assert_eq!(result.origin.y, 230.0); // 200 + 30
        assert_eq!(result.size.width, 50.0);
        assert_eq!(result.size.height, 25.0);
    }

    #[test]
    fn page_coords_relative_without_parent_is_absolute() {
        let parent_offset = CorePoint { x: 0.0, y: 0.0 };
        let child = make_geom(10.0, 30.0, 50.0, 25.0, true);
        let result = page_coords(&child, parent_offset);

        // Relative but zero parent offset: behaves as absolute
        assert_eq!(result.origin.x, 10.0);
        assert_eq!(result.origin.y, 30.0);
    }

    // =============================================================================
    // Task 4.1 RED — hidden-layer filtering tests
    // These tests define the expected behavior for layer visibility filtering.
    // They currently FAIL because the hidden-layer filter is not yet implemented.
    // =============================================================================

    #[test]
    fn build_vertex_on_hidden_layer_is_skipped() {
        // GIVEN a page with a visible default layer and a hidden named layer
        let mut model = DiagramModel::new();
        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        // Insert a hidden layer
        let hidden_layer = Layer {
            id: LayerId::default(),
            page_id: pid,
            name: Some(Label::new("Hidden")),
            visible: false, // hidden!
            locked: false,
        };
        let hidden_layer_id = model.store.insert_layer(hidden_layer);

        // Insert a vertex on the hidden layer
        let geom = make_geom(10.0, 20.0, 80.0, 40.0, false);
        let vertex = Vertex {
            geometry: Some(geom),
            page_id: Some(pid),
            layer_id: Some(hidden_layer_id), // on hidden layer
            ..Default::default()
        };
        let _vid = model.store.insert_vertex(vertex);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        assert_eq!(scene.pages.len(), 1);
        let page_scene = &scene.pages[0];
        // Vertex on hidden layer must NOT appear in the scene
        assert!(
            page_scene.display_list.is_empty(),
            "Vertex on hidden layer should be skipped from scene"
        );
    }

    #[test]
    fn build_vertex_on_visible_layer_appears() {
        // GIVEN a page with a visible named layer
        let mut model = DiagramModel::new();
        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        // Insert a visible layer
        let visible_layer = Layer {
            id: LayerId::default(),
            page_id: pid,
            name: Some(Label::new("Visible")),
            visible: true, // visible!
            locked: false,
        };
        let visible_layer_id = model.store.insert_layer(visible_layer);

        // Insert a vertex on the visible layer
        let geom = make_geom(10.0, 20.0, 80.0, 40.0, false);
        let vertex = Vertex {
            geometry: Some(geom),
            page_id: Some(pid),
            layer_id: Some(visible_layer_id), // on visible layer
            ..Default::default()
        };
        let vid = model.store.insert_vertex(vertex);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        assert_eq!(scene.pages.len(), 1);
        let page_scene = &scene.pages[0];
        // Vertex on visible layer MUST appear in the scene
        assert_eq!(page_scene.display_list.len(), 1);
        match &page_scene.display_list[0] {
            VisualElement::Rect(rect) => assert_eq!(rect.id, vid),
            other => panic!("Expected Rect, got {:?}", other),
        }
    }

    #[test]
    fn build_vertex_on_default_layer_appears() {
        // GIVEN a page with only the default layer (layer_id = None = default)
        let mut model = DiagramModel::new();
        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        // Insert a vertex on the default layer (layer_id = None)
        let geom = make_geom(10.0, 20.0, 80.0, 40.0, false);
        let vertex = Vertex {
            geometry: Some(geom),
            page_id: Some(pid),
            layer_id: None, // default layer
            ..Default::default()
        };
        let vid = model.store.insert_vertex(vertex);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        assert_eq!(scene.pages.len(), 1);
        let page_scene = &scene.pages[0];
        // Default layer is always visible, so vertex MUST appear
        assert_eq!(page_scene.display_list.len(), 1);
        match &page_scene.display_list[0] {
            VisualElement::Rect(rect) => assert_eq!(rect.id, vid),
            other => panic!("Expected Rect, got {:?}", other),
        }
    }

    #[test]
    fn build_edge_where_both_endpoints_on_hidden_layer_is_skipped() {
        // GIVEN a hidden layer with two vertices and an edge between them
        let mut model = DiagramModel::new();
        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        // Hidden layer
        let hidden_layer = Layer {
            id: LayerId::default(),
            page_id: pid,
            name: Some(Label::new("Hidden")),
            visible: false,
            locked: false,
        };
        let hidden_layer_id = model.store.insert_layer(hidden_layer);

        // Vertex 1 on hidden layer
        let geom1 = make_geom(10.0, 20.0, 80.0, 40.0, false);
        let v1 = Vertex {
            geometry: Some(geom1),
            page_id: Some(pid),
            layer_id: Some(hidden_layer_id),
            ..Default::default()
        };
        let vid1 = model.store.insert_vertex(v1);

        // Vertex 2 on hidden layer
        let geom2 = make_geom(100.0, 20.0, 80.0, 40.0, false);
        let v2 = Vertex {
            geometry: Some(geom2),
            page_id: Some(pid),
            layer_id: Some(hidden_layer_id),
            ..Default::default()
        };
        let vid2 = model.store.insert_vertex(v2);

        // Edge between them (also on hidden layer)
        let edge = Edge {
            source: vid1,
            target: vid2,
            page_id: Some(pid),
            layer_id: Some(hidden_layer_id),
            ..Default::default()
        };
        let _eid = model.store.insert_edge(edge);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        assert_eq!(scene.pages.len(), 1);
        let page_scene = &scene.pages[0];
        // Both endpoints are on hidden layer → edge must NOT appear
        assert!(
            page_scene.display_list.is_empty(),
            "Edge with both endpoints on hidden layer should be skipped"
        );
    }

    #[test]
    fn build_edge_where_both_endpoints_on_visible_layer_appears() {
        // GIVEN a visible layer with two vertices and an edge between them
        let mut model = DiagramModel::new();
        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        // Visible layer
        let visible_layer = Layer {
            id: LayerId::default(),
            page_id: pid,
            name: Some(Label::new("Visible")),
            visible: true,
            locked: false,
        };
        let visible_layer_id = model.store.insert_layer(visible_layer);

        // Vertex 1 on visible layer
        let geom1 = make_geom(10.0, 20.0, 80.0, 40.0, false);
        let v1 = Vertex {
            geometry: Some(geom1),
            page_id: Some(pid),
            layer_id: Some(visible_layer_id),
            ..Default::default()
        };
        let vid1 = model.store.insert_vertex(v1);

        // Vertex 2 on visible layer
        let geom2 = make_geom(100.0, 20.0, 80.0, 40.0, false);
        let v2 = Vertex {
            geometry: Some(geom2),
            page_id: Some(pid),
            layer_id: Some(visible_layer_id),
            ..Default::default()
        };
        let vid2 = model.store.insert_vertex(v2);

        // Edge between them (on visible layer)
        let edge = Edge {
            source: vid1,
            target: vid2,
            page_id: Some(pid),
            layer_id: Some(visible_layer_id),
            ..Default::default()
        };
        let _eid = model.store.insert_edge(edge);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        assert_eq!(scene.pages.len(), 1);
        let page_scene = &scene.pages[0];
        // Both endpoints visible → edge must appear (3 elements: v1 rect, v2 rect, edge)
        assert_eq!(page_scene.display_list.len(), 3);
    }

    #[test]
    fn build_edge_cross_layer_one_hidden_one_visible_is_skipped() {
        // GIVEN: one vertex on visible layer, one vertex on hidden layer
        // Edge between them → should be skipped (both endpoints must be visible)
        let mut model = DiagramModel::new();
        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        // Visible layer
        let visible_layer = Layer {
            id: LayerId::default(),
            page_id: pid,
            name: Some(Label::new("Visible")),
            visible: true,
            locked: false,
        };
        let visible_layer_id = model.store.insert_layer(visible_layer);

        // Hidden layer
        let hidden_layer = Layer {
            id: LayerId::default(),
            page_id: pid,
            name: Some(Label::new("Hidden")),
            visible: false,
            locked: false,
        };
        let hidden_layer_id = model.store.insert_layer(hidden_layer);

        // Vertex 1 on visible layer
        let geom1 = make_geom(10.0, 20.0, 80.0, 40.0, false);
        let v1 = Vertex {
            geometry: Some(geom1),
            page_id: Some(pid),
            layer_id: Some(visible_layer_id),
            ..Default::default()
        };
        let vid1 = model.store.insert_vertex(v1);

        // Vertex 2 on hidden layer
        let geom2 = make_geom(100.0, 20.0, 80.0, 40.0, false);
        let v2 = Vertex {
            geometry: Some(geom2),
            page_id: Some(pid),
            layer_id: Some(hidden_layer_id),
            ..Default::default()
        };
        let vid2 = model.store.insert_vertex(v2);

        // Edge between them (cross-layer)
        let edge = Edge {
            source: vid1,
            target: vid2,
            page_id: Some(pid),
            layer_id: None, // default layer
            ..Default::default()
        };
        let _eid = model.store.insert_edge(edge);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        assert_eq!(scene.pages.len(), 1);
        let page_scene = &scene.pages[0];
        // Only the vertex on visible layer appears; edge is skipped because
        // one endpoint (vid2) is on a hidden layer
        assert_eq!(page_scene.display_list.len(), 1);
    }

    #[test]
    fn build_group_on_hidden_layer_is_skipped() {
        // GIVEN a group on a hidden layer
        let mut model = DiagramModel::new();
        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        // Hidden layer
        let hidden_layer = Layer {
            id: LayerId::default(),
            page_id: pid,
            name: Some(Label::new("Hidden")),
            visible: false,
            locked: false,
        };
        let hidden_layer_id = model.store.insert_layer(hidden_layer);

        // Group on hidden layer
        let group_geom = make_geom(10.0, 10.0, 200.0, 200.0, false);
        let group = Group {
            geometry: Some(group_geom),
            page_id: Some(pid),
            layer_id: Some(hidden_layer_id),
            ..Default::default()
        };
        let _gid = model.store.insert_group(group);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        assert_eq!(scene.pages.len(), 1);
        let page_scene = &scene.pages[0];
        // Group on hidden layer must NOT appear
        assert!(
            page_scene.display_list.is_empty(),
            "Group on hidden layer should be skipped"
        );
    }

    #[test]
    fn build_child_vertex_inside_group_on_hidden_layer_is_skipped() {
        // GIVEN a group on a visible layer, but a child vertex inside it on a hidden layer
        let mut model = DiagramModel::new();
        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        // Visible layer for the group
        let visible_layer = Layer {
            id: LayerId::default(),
            page_id: pid,
            name: Some(Label::new("VisibleGroup")),
            visible: true,
            locked: false,
        };
        let visible_layer_id = model.store.insert_layer(visible_layer);

        // Hidden layer for the child vertex
        let hidden_layer = Layer {
            id: LayerId::default(),
            page_id: pid,
            name: Some(Label::new("HiddenContent")),
            visible: false,
            locked: false,
        };
        let hidden_layer_id = model.store.insert_layer(hidden_layer);

        // Group on visible layer
        let group_geom = make_geom(10.0, 10.0, 200.0, 200.0, false);
        let group = Group {
            geometry: Some(group_geom),
            page_id: Some(pid),
            layer_id: Some(visible_layer_id),
            ..Default::default()
        };
        let gid = model.store.insert_group(group);

        // Child vertex inside group but on hidden layer
        let child_geom = make_geom(20.0, 20.0, 50.0, 30.0, true);
        let child = Vertex {
            geometry: Some(child_geom),
            parent: Some(gid),
            page_id: Some(pid),
            layer_id: Some(hidden_layer_id), // hidden!
            ..Default::default()
        };
        let _vid = model.store.insert_vertex(child);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        assert_eq!(scene.pages.len(), 1);
        let page_scene = &scene.pages[0];
        // Group appears (visible layer) but child vertex on hidden layer is filtered
        assert_eq!(page_scene.display_list.len(), 1);
        match &page_scene.display_list[0] {
            VisualElement::Group(g) => {
                // Group is visible but has no children because child is on hidden layer
                assert!(
                    g.children.is_empty(),
                    "Child vertex on hidden layer should not appear inside group"
                );
            }
            other => panic!("Expected Group, got {:?}", other),
        }
    }

    #[test]
    fn build_three_layers_only_visible_content_appears() {
        // GIVEN 3 total layers: 2 visible (3 shapes) + 1 hidden (2 shapes)
        // WHEN scene is built
        // THEN scene contains only the 3 shapes from visible layers
        let mut model = DiagramModel::new();
        let page = Page::new(diagram_core::PageId::default());
        let pid = model.store.insert_page(page);

        // Visible layer 1: 2 shapes
        let vis1 = Layer {
            id: LayerId::default(),
            page_id: pid,
            name: Some(Label::new("Vis1")),
            visible: true,
            locked: false,
        };
        let vis1_id = model.store.insert_layer(vis1);

        // Visible layer 2: 1 shape
        let vis2 = Layer {
            id: LayerId::default(),
            page_id: pid,
            name: Some(Label::new("Vis2")),
            visible: true,
            locked: false,
        };
        let vis2_id = model.store.insert_layer(vis2);

        // Hidden layer: 2 shapes
        let hidden = Layer {
            id: LayerId::default(),
            page_id: pid,
            name: Some(Label::new("Hidden")),
            visible: false,
            locked: false,
        };
        let hidden_id = model.store.insert_layer(hidden);

        // Shape A on vis1
        let geom_a = make_geom(10.0, 10.0, 50.0, 50.0, false);
        let shape_a = Vertex {
            geometry: Some(geom_a),
            page_id: Some(pid),
            layer_id: Some(vis1_id),
            ..Default::default()
        };
        let _vid_a = model.store.insert_vertex(shape_a);

        // Shape B on vis1
        let geom_b = make_geom(70.0, 10.0, 50.0, 50.0, false);
        let shape_b = Vertex {
            geometry: Some(geom_b),
            page_id: Some(pid),
            layer_id: Some(vis1_id),
            ..Default::default()
        };
        let _vid_b = model.store.insert_vertex(shape_b);

        // Shape C on vis2
        let geom_c = make_geom(130.0, 10.0, 50.0, 50.0, false);
        let shape_c = Vertex {
            geometry: Some(geom_c),
            page_id: Some(pid),
            layer_id: Some(vis2_id),
            ..Default::default()
        };
        let _vid_c = model.store.insert_vertex(shape_c);

        // Shape D on hidden (should NOT appear)
        let geom_d = make_geom(10.0, 70.0, 50.0, 50.0, false);
        let shape_d = Vertex {
            geometry: Some(geom_d),
            page_id: Some(pid),
            layer_id: Some(hidden_id),
            ..Default::default()
        };
        let _vid_d = model.store.insert_vertex(shape_d);

        // Shape E on hidden (should NOT appear)
        let geom_e = make_geom(70.0, 70.0, 50.0, 50.0, false);
        let shape_e = Vertex {
            geometry: Some(geom_e),
            page_id: Some(pid),
            layer_id: Some(hidden_id),
            ..Default::default()
        };
        let _vid_e = model.store.insert_vertex(shape_e);

        let builder = SceneBuilder::new();
        let scene = builder.build(&model).unwrap();

        assert_eq!(scene.pages.len(), 1);
        let page_scene = &scene.pages[0];
        // Only 3 shapes from visible layers
        assert_eq!(
            page_scene.display_list.len(),
            3,
            "Only shapes from visible layers should appear (got {:?})",
            page_scene.display_list
        );
    }
}
