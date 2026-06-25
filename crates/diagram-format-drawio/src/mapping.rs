//! Domain mapping: convert the raw `.drawio` model into a
//! [`diagram_core::DiagramModel`] and back.
//!
//! The raw model is the source of truth for round-trip fidelity; the domain
//! model is the source of truth for editing and rendering. This module is
//! where we reconcile the two without leaking `.drawio` semantics upward.
//!
//! See `docs/adr/0009-rust-native-model-with-drawio-mapping.md` and
//! `docs/adr/0024-preserve-unknown-when-safe-degrade-explicitly.md`.

use std::collections::BTreeMap;

use diagram_core::geometry::CellGeometry;
use diagram_core::id::{EdgeId, GroupId, VertexId};
use diagram_core::label::Label;
use diagram_core::style::StyleMap;
use diagram_core::{DiagramModel, Edge, Group, Page, Vertex};

use crate::error::{Diagnostic, FormatResult};
use crate::raw::{RawDrawioCell, RawDrawioDiagram, RawDrawioDocument};

/// Bidirectional mapping between raw `.drawio` cell IDs and engine-owned identifiers.
///
/// The `IdMap` is built during [`DrawioMapping::to_domain`] and consumed during
/// [`DrawioMapping::to_raw`] to reconstruct the raw cell ID for each engine entity.
#[derive(Debug, Default, Clone)]
pub struct IdMap {
    /// Maps raw vertex ID string → engine VertexId.
    pub vertices: BTreeMap<String, VertexId>,
    /// Maps raw edge ID string → engine EdgeId.
    pub edges: BTreeMap<String, EdgeId>,
    /// Maps raw group ID string → engine GroupId.
    pub groups: BTreeMap<String, GroupId>,
}

impl IdMap {
    /// Create a new, empty IdMap.
    pub fn new() -> Self {
        Self::default()
    }

    /// Look up the internal [`VertexId`] for a raw cell ID.
    pub fn get_internal_vertex(&self, raw_id: &str) -> Option<VertexId> {
        self.vertices.get(raw_id).copied()
    }

    /// Look up the internal [`EdgeId`] for a raw cell ID.
    pub fn get_internal_edge(&self, raw_id: &str) -> Option<EdgeId> {
        self.edges.get(raw_id).copied()
    }

    /// Look up the internal [`GroupId`] for a raw cell ID.
    pub fn get_internal_group(&self, raw_id: &str) -> Option<GroupId> {
        self.groups.get(raw_id).copied()
    }

    /// Look up the raw cell ID string for an internal [`VertexId`].
    pub fn get_external_vertex(&self, vid: VertexId) -> Option<String> {
        self.vertices
            .iter()
            .find(|(_, v)| **v == vid)
            .map(|(k, _)| k.clone())
    }

    /// Look up the raw cell ID string for an internal [`EdgeId`].
    pub fn get_external_edge(&self, eid: EdgeId) -> Option<String> {
        self.edges
            .iter()
            .find(|(_, e)| **e == eid)
            .map(|(k, _)| k.clone())
    }

    /// Look up the raw cell ID string for an internal [`GroupId`].
    pub fn get_external_group(&self, gid: GroupId) -> Option<String> {
        self.groups
            .iter()
            .find(|(_, g)| **g == gid)
            .map(|(k, _)| k.clone())
    }

    /// Total number of entries across all three maps.
    pub fn len(&self) -> usize {
        self.vertices.len() + self.edges.len() + self.groups.len()
    }

    /// Returns `true` if all three maps are empty.
    pub fn is_empty(&self) -> bool {
        self.vertices.is_empty() && self.edges.is_empty() && self.groups.is_empty()
    }

    /// Look up any cell reference by its raw ID string.
    pub(crate) fn get_cell_ref(&self, raw_id: &str) -> Option<CellRef> {
        if let Some(&vid) = self.vertices.get(raw_id) {
            return Some(CellRef::Vertex(vid));
        }
        if let Some(&eid) = self.edges.get(raw_id) {
            return Some(CellRef::Edge(eid));
        }
        if let Some(&gid) = self.groups.get(raw_id) {
            return Some(CellRef::Group(gid));
        }
        None
    }
}

/// Synthesize an [`IdMap`] from a [`DiagramModel`] for use when exporting a fresh engine
/// (one that has no import-time ID mapping).
///
/// Walks vertices, edges, and groups in stable slotmap insertion order, assigning
/// sequential string IDs: `"v0"`, `"v1"`, … for vertices, `"e0"`, `"e1"`, … for edges,
/// `"g0"`, `"g1"`, … for groups.
///
/// Returns an empty [`IdMap`] if the model has no vertices, edges, or groups.
pub fn synthesize_id_map(model: &DiagramModel) -> IdMap {
    let mut id_map = IdMap::new();

    for (v_idx, (vid, _vertex)) in model.store.vertices_with_ids().enumerate() {
        let key = format!("v{v_idx}");
        id_map.vertices.insert(key, vid);
    }

    for (e_idx, (eid, _edge)) in model.store.edges_with_ids().enumerate() {
        let key = format!("e{e_idx}");
        id_map.edges.insert(key, eid);
    }

    for (g_idx, (gid, _group)) in model.store.groups_with_ids().enumerate() {
        let key = format!("g{g_idx}");
        id_map.groups.insert(key, gid);
    }

    id_map
}

/// A reference to a cell's allocated engine ID, tagged by kind.
#[derive(Clone, Copy)]
pub(crate) enum CellRef {
    /// The cell is a vertex.
    Vertex(VertexId),
    /// The cell is an edge.
    Edge(EdgeId),
    /// The cell is a group.
    Group(GroupId),
}

/// Stateless mapper from raw `.drawio` documents to the diagram-core domain
/// model.
#[derive(Debug, Default, Clone, Copy)]
pub struct DrawioMapping;

impl DrawioMapping {
    /// Create a new mapping instance.
    pub fn new() -> Self {
        Self
    }

    /// Convert a [`RawDrawioDocument`] into a [`DiagramModel`].
    ///
    /// Diagnostics are discarded. Use [`to_domain_with_diagnostics`](Self::to_domain_with_diagnostics)
    /// if you need to inspect compatibility warnings.
    ///
    /// Returns the domain model and the bidirectional ID mapping.
    pub fn to_domain(&self, raw: &RawDrawioDocument) -> FormatResult<(DiagramModel, IdMap)> {
        let mut diags = Vec::new();
        self.to_domain_with_diagnostics(raw, &mut diags)
    }

    /// Convert a [`RawDrawioDocument`] into a [`DiagramModel`], collecting diagnostics.
    ///
    /// Returns the domain model and the bidirectional ID mapping.
    pub fn to_domain_with_diagnostics(
        &self,
        raw: &RawDrawioDocument,
        diags: &mut Vec<Diagnostic>,
    ) -> FormatResult<(DiagramModel, IdMap)> {
        let mut model = DiagramModel::new();
        let mut id_map = IdMap::new();

        // For each raw diagram, insert a page with no name yet
        for _diagram in &raw.diagrams {
            // Insert a placeholder page; the slotmap key IS the page ID
            model.store.insert_page(Page::new(Default::default()));
        }

        // Set page names and backgrounds from diagram names (pages_mut() returns pages in insertion order)
        for (page, diagram) in model.store.pages_mut().zip(raw.diagrams.iter()) {
            page.name = diagram.name.as_ref().map(|n| Label::new(n.as_str()));
            page.background = diagram.background.clone();
        }

        // PASS 1 — Forward sweep: allocate placeholder entries, record raw→engine ID
        // Track cell index as z_order (XML child order = draw.io z-order)
        let mut z_orders: BTreeMap<String, i32> = BTreeMap::new();

        for (diagram_idx, diagram) in raw.diagrams.iter().enumerate() {
            // Pages are stored in insertion order matching diagram indices
            let page_id = model
                .store
                .pages_with_ids()
                .nth(diagram_idx)
                .map(|(id, _)| id);

            for (idx, cell) in diagram.cells.iter().enumerate() {
                z_orders.insert(cell.id.clone(), idx as i32);
                // Swimlane cells carry vertex=1 but are containers — classify as group
                let is_swimlane = cell
                    .style
                    .as_ref()
                    .map(|s| s.contains("swimlane"))
                    .unwrap_or(false);
                if cell.vertex && !cell.edge && !is_swimlane {
                    let vid = model.store.insert_vertex(Vertex {
                        page_id,
                        ..Default::default()
                    });
                    id_map.vertices.insert(cell.id.clone(), vid);
                } else if cell.edge && !cell.vertex {
                    let eid = model.store.insert_edge(Edge {
                        page_id,
                        ..Default::default()
                    });
                    id_map.edges.insert(cell.id.clone(), eid);
                } else {
                    // Group container (neither vertex nor edge)
                    let gid = model.store.insert_group(Group {
                        page_id,
                        ..Default::default()
                    });
                    id_map.groups.insert(cell.id.clone(), gid);
                }
            }
        }

        // PASS 2 — Backward sweep: resolve, materialize, attach styles
        let mut style_cache: BTreeMap<String, diagram_core::id::StyleId> = BTreeMap::new();

        for diagram in &raw.diagrams {
            for cell in &diagram.cells {
                let cell_ref = match id_map.get_cell_ref(&cell.id) {
                    Some(r) => r,
                    None => continue,
                };

                // Parse style string → StyleId (local dedup)
                let style_id = cell.style.as_ref().map(|s| {
                    let s_str = s.as_str();
                    if let Some(&sid) = style_cache.get(s_str) {
                        sid
                    } else {
                        let smap = parse_style_string(s_str);
                        let sid = model.store.insert_style(smap);
                        style_cache.insert(s_str.to_owned(), sid);
                        sid
                    }
                });

                // Build CellGeometry if applicable
                let cell_geo = cell
                    .geometry
                    .as_ref()
                    .filter(|_| matches!(cell_ref, CellRef::Vertex(_) | CellRef::Group(_)))
                    .map(|geo| {
                        // Convert draw.io rotation (degrees) to radians
                        let rotation_rad = geo
                            .rotation
                            .map(|deg| deg * std::f64::consts::PI / 180.0)
                            .unwrap_or(0.0);
                        CellGeometry {
                            x: geo.x,
                            y: geo.y,
                            width: geo.width,
                            height: geo.height,
                            relative: geo.r#as != "geometry",
                            rotation: rotation_rad,
                            flip_h: geo.flip_h.unwrap_or(false),
                            flip_v: geo.flip_v.unwrap_or(false),
                        }
                    });

                match cell_ref {
                    CellRef::Vertex(vid) => {
                        let label = cell.value.as_ref().map(|v| Label::new(v.as_str()));
                        let parent = resolve_parent(&cell.parent, &id_map, diags);
                        // Preserve page_id set during pass 1
                        let page_id = model.store.vertex(vid).and_then(|v| v.page_id);
                        // z_order from XML child index; locked/visible from extra attributes
                        let z_order = z_orders.get(&cell.id).copied().unwrap_or(0);
                        let locked = cell.extra.get("locked").map(|v| v == "1").unwrap_or(false);
                        let visible = cell.extra.get("visible").map(|v| v != "0").unwrap_or(true);
                        let vertex = Vertex {
                            geometry: cell_geo,
                            label,
                            style_id,
                            parent,
                            page_id,
                            z_order,
                            locked,
                            visible,
                        };
                        model.store.replace_vertex(vid, vertex);
                    }
                    CellRef::Group(gid) => {
                        let label = cell.value.as_ref().map(|v| Label::new(v.as_str()));
                        let parent = resolve_parent(&cell.parent, &id_map, diags);
                        // Preserve page_id set during pass 1
                        let page_id = model.store.group(gid).and_then(|g| g.page_id);
                        // z_order from XML child index; locked/visible from extra attributes
                        let z_order = z_orders.get(&cell.id).copied().unwrap_or(0);
                        let locked = cell.extra.get("locked").map(|v| v == "1").unwrap_or(false);
                        let visible = cell.extra.get("visible").map(|v| v != "0").unwrap_or(true);
                        let group = Group {
                            geometry: cell_geo,
                            label,
                            style_id,
                            parent,
                            page_id,
                            z_order,
                            locked,
                            visible,
                        };
                        model.store.replace_group(gid, group);
                    }
                    CellRef::Edge(eid) => {
                        // Resolve source and target to VertexIds
                        let source_id = cell
                            .source
                            .as_ref()
                            .and_then(|sid| id_map.get_internal_vertex(sid));
                        let target_id = cell
                            .target
                            .as_ref()
                            .and_then(|tid| id_map.get_internal_vertex(tid));

                        match (source_id, target_id) {
                            (Some(source), Some(target)) => {
                                let label = cell.value.as_ref().map(|v| Label::new(v.as_str()));
                                // Preserve page_id set during pass 1
                                let page_id = model.store.edge(eid).and_then(|e| e.page_id);
                                // z_order from XML child index; locked/visible from extra attributes
                                let z_order = z_orders.get(&cell.id).copied().unwrap_or(0);
                                let locked =
                                    cell.extra.get("locked").map(|v| v == "1").unwrap_or(false);
                                let visible =
                                    cell.extra.get("visible").map(|v| v != "0").unwrap_or(true);
                                let edge = Edge {
                                    label,
                                    style_id,
                                    source,
                                    target,
                                    waypoints: cell
                                        .geometry
                                        .as_ref()
                                        .map(|g| {
                                            g.points
                                                .iter()
                                                .map(|(x, y)| diagram_core::geometry::Point {
                                                    x: *x,
                                                    y: *y,
                                                })
                                                .collect()
                                        })
                                        .unwrap_or_default(),
                                    page_id,
                                    z_order,
                                    locked,
                                    visible,
                                    label_offset: None,
                                };
                                model.store.replace_edge(eid, edge);
                            }
                            _ => {
                                // Dangling reference — drop edge, emit diagnostic
                                let location = format!("cell id=\"{}\"", cell.id);
                                let msg = if source_id.is_none() && target_id.is_none() {
                                    format!(
                                        "edge source=\"{:?}\" target=\"{:?}\" — both dangling, dropped",
                                        cell.source, cell.target
                                    )
                                } else if source_id.is_none() {
                                    format!(
                                        "edge source=\"{:?}\" is dangling, edge dropped",
                                        cell.source
                                    )
                                } else {
                                    format!(
                                        "edge target=\"{:?}\" is dangling, edge dropped",
                                        cell.target
                                    )
                                };
                                diags.push(Diagnostic {
                                    location,
                                    message: msg,
                                });
                                // Remove the placeholder edge from the store
                                model.store.remove_edge(eid);
                            }
                        }
                    }
                }
            }
        }

        Ok((model, id_map))
    }

    /// Convert a [`DiagramModel`] back to a [`RawDrawioDocument`].
    ///
    /// Uses the provided [`IdMap`] to look up raw cell IDs for each engine entity.
    /// Diagnostics are emitted for any entities that cannot be mapped back (e.g.
    /// if the IdMap is incomplete).
    pub fn to_raw(
        &self,
        model: &DiagramModel,
        id_map: &IdMap,
        diags: &mut Vec<Diagnostic>,
    ) -> FormatResult<RawDrawioDocument> {
        let mut diagrams = Vec::new();

        for (page_id, _page) in model.store.pages_with_ids() {
            let (diagram_name, diagram_background) = {
                let page = model.store.page(page_id).expect("page must exist");
                (
                    page.name.as_ref().map(|l| l.text.as_str().to_owned()),
                    page.background.clone(),
                )
            };

            let mut cells = Vec::new();

            // Collect vertices for this page
            for (vid, vertex) in model.store.vertices_with_ids() {
                if vertex.page_id != Some(page_id) {
                    continue;
                }
                let raw_id = match id_map.get_external_vertex(vid) {
                    Some(id) => id,
                    None => {
                        diags.push(Diagnostic {
                            location: format!("vertex {:?}", vid),
                            message: "vertex has no corresponding raw ID in IdMap".to_owned(),
                        });
                        continue;
                    }
                };

                let style = vertex.style_id.map(|sid| {
                    let smap = model.store.style(sid).expect("style must exist");
                    format_style_string(smap)
                });

                let geometry = vertex.geometry.as_ref().map(|geo| {
                    // Convert radians to degrees for draw.io; only emit if non-zero
                    let rotation_deg = if geo.rotation != 0.0 {
                        Some(geo.rotation * 180.0 / std::f64::consts::PI)
                    } else {
                        None
                    };
                    crate::raw::RawDrawioGeometry {
                        x: geo.x,
                        y: geo.y,
                        width: geo.width,
                        height: geo.height,
                        r#as: if geo.relative {
                            String::new()
                        } else {
                            "geometry".to_owned()
                        },
                        rotation: rotation_deg,
                        flip_h: if geo.flip_h { Some(true) } else { None },
                        flip_v: if geo.flip_v { Some(true) } else { None },
                        points: Vec::new(),
                    }
                });

                let parent = vertex.parent.and_then(|gid| id_map.get_external_group(gid));

                // Build extra: emit locked/visible when non-default
                let mut extra = BTreeMap::new();
                if vertex.locked {
                    extra.insert("locked".to_owned(), "1".to_owned());
                }
                if !vertex.visible {
                    extra.insert("visible".to_owned(), "0".to_owned());
                }

                let cell = RawDrawioCell {
                    id: raw_id,
                    value: vertex.label.as_ref().map(|l| l.text.as_str().to_owned()),
                    style,
                    vertex: true,
                    edge: false,
                    parent,
                    source: None,
                    target: None,
                    geometry,
                    extra,
                };
                cells.push((vertex.z_order, cell));
            }

            // Collect edges for this page
            for (eid, edge) in model.store.edges_with_ids() {
                if edge.page_id != Some(page_id) {
                    continue;
                }
                let raw_id = match id_map.get_external_edge(eid) {
                    Some(id) => id,
                    None => {
                        diags.push(Diagnostic {
                            location: format!("edge {:?}", eid),
                            message: "edge has no corresponding raw ID in IdMap".to_owned(),
                        });
                        continue;
                    }
                };

                let source_raw = match id_map.get_external_vertex(edge.source) {
                    Some(id) => id,
                    None => {
                        diags.push(Diagnostic {
                            location: format!("edge {:?}", eid),
                            message: format!("edge source {:?} not found in IdMap", edge.source),
                        });
                        continue;
                    }
                };

                let target_raw = match id_map.get_external_vertex(edge.target) {
                    Some(id) => id,
                    None => {
                        diags.push(Diagnostic {
                            location: format!("edge {:?}", eid),
                            message: format!("edge target {:?} not found in IdMap", edge.target),
                        });
                        continue;
                    }
                };

                let style = edge.style_id.map(|sid| {
                    let smap = model.store.style(sid).expect("style must exist");
                    format_style_string(smap)
                });

                // Build extra: emit locked/visible when non-default
                let mut extra = BTreeMap::new();
                if edge.locked {
                    extra.insert("locked".to_owned(), "1".to_owned());
                }
                if !edge.visible {
                    extra.insert("visible".to_owned(), "0".to_owned());
                }

                let cell = RawDrawioCell {
                    id: raw_id,
                    value: edge.label.as_ref().map(|l| l.text.as_str().to_owned()),
                    style,
                    vertex: false,
                    edge: true,
                    parent: None,
                    source: Some(source_raw),
                    target: Some(target_raw),
                    geometry: if edge.waypoints.is_empty() {
                        None
                    } else {
                        Some(crate::raw::RawDrawioGeometry {
                            x: 0.0,
                            y: 0.0,
                            width: 0.0,
                            height: 0.0,
                            r#as: "geometry".to_owned(),
                            rotation: None,
                            flip_h: None,
                            flip_v: None,
                            points: edge.waypoints.iter().map(|p| (p.x, p.y)).collect(),
                        })
                    },
                    extra,
                };
                cells.push((edge.z_order, cell));
            }

            // Collect groups for this page
            for (gid, group) in model.store.groups_with_ids() {
                if group.page_id != Some(page_id) {
                    continue;
                }
                let raw_id = match id_map.get_external_group(gid) {
                    Some(id) => id,
                    None => {
                        diags.push(Diagnostic {
                            location: format!("group {:?}", gid),
                            message: "group has no corresponding raw ID in IdMap".to_owned(),
                        });
                        continue;
                    }
                };

                let style = group.style_id.map(|sid| {
                    let smap = model.store.style(sid).expect("style must exist");
                    format_style_string(smap)
                });

                let geometry = group.geometry.as_ref().map(|geo| {
                    // Convert radians to degrees for draw.io; only emit if non-zero
                    let rotation_deg = if geo.rotation != 0.0 {
                        Some(geo.rotation * 180.0 / std::f64::consts::PI)
                    } else {
                        None
                    };
                    crate::raw::RawDrawioGeometry {
                        x: geo.x,
                        y: geo.y,
                        width: geo.width,
                        height: geo.height,
                        r#as: if geo.relative {
                            String::new()
                        } else {
                            "geometry".to_owned()
                        },
                        rotation: rotation_deg,
                        flip_h: if geo.flip_h { Some(true) } else { None },
                        flip_v: if geo.flip_v { Some(true) } else { None },
                        points: Vec::new(),
                    }
                });

                // Build extra: emit locked/visible when non-default
                let mut extra = BTreeMap::new();
                if group.locked {
                    extra.insert("locked".to_owned(), "1".to_owned());
                }
                if !group.visible {
                    extra.insert("visible".to_owned(), "0".to_owned());
                }

                let cell = RawDrawioCell {
                    id: raw_id,
                    value: group.label.as_ref().map(|l| l.text.as_str().to_owned()),
                    style,
                    vertex: false,
                    edge: false,
                    parent: group.parent.and_then(|gid| id_map.get_external_group(gid)),
                    source: None,
                    target: None,
                    geometry,
                    extra,
                };
                cells.push((group.z_order, cell));
            }

            // Sort cells by z_order ascending before emitting
            cells.sort_by_key(|(z, _)| *z);
            let cells: Vec<_> = cells.into_iter().map(|(_, c)| c).collect();

            diagrams.push(RawDrawioDiagram {
                name: diagram_name,
                background: diagram_background,
                cells,
                graph_model: Default::default(),
            });
        }

        Ok(RawDrawioDocument { diagrams })
    }
}

/// Resolve a raw `parent` string to a `GroupId`, emitting a diagnostic if dangling.
fn resolve_parent(
    parent: &Option<String>,
    id_map: &IdMap,
    diags: &mut Vec<Diagnostic>,
) -> Option<diagram_core::id::GroupId> {
    let sid = parent.as_ref()?;
    match id_map.get_internal_group(sid) {
        Some(gid) => Some(gid),
        None => {
            diags.push(Diagnostic {
                location: format!("cell parent=\"{}\"", sid),
                message: "dangling parent reference".to_owned(),
            });
            None
        }
    }
}

/// Parse a draw.io style string into a `StyleMap`.
///
/// Splits on `;` first, then on the first `=` in each segment.
/// Verbatim preservation: no trimming, no reordering, no normalization.
fn parse_style_string(s: &str) -> diagram_core::style::StyleMap {
    use diagram_core::style::{StyleMap, StyleValue};
    let mut map = StyleMap::new();
    if s.is_empty() {
        return map;
    }
    for segment in s.split(';') {
        if segment.is_empty() {
            continue;
        }
        // Split on first '=' only
        if let Some(eq_pos) = segment.find('=') {
            let key = &segment[..eq_pos];
            let value = &segment[eq_pos + 1..];
            map.insert(key, StyleValue(value.to_owned()));
        } else {
            // Bare key (no '=') — preserved as-is with empty value
            map.insert(segment, StyleValue(String::new()));
        }
    }
    map
}

/// Serialize a [`StyleMap`] back to a `.drawio` style string.
///
/// Entries are emitted in lexicographic key order (BTreeMap iteration order).
/// Key=value pairs are emitted as `key=value;`. The final trailing `;` is
/// included to match draw.io convention.
pub fn format_style_string(style: &StyleMap) -> String {
    // BTreeMap gives lexicographic iteration order
    let mut result = String::new();
    for (key, value) in style.iter() {
        result.push_str(key);
        result.push('=');
        result.push_str(value.as_str());
        result.push(';');
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::raw::{RawDrawioCell, RawDrawioDiagram, RawDrawioDocument};

    #[test]
    fn test_empty_document_page_count_zero() {
        let mapper = DrawioMapping::new();
        let doc = RawDrawioDocument { diagrams: vec![] };
        let (model, _id_map) = mapper.to_domain(&doc).unwrap();
        assert_eq!(model.page_count(), 0);
    }

    #[test]
    fn test_empty_diagram_page_count_one() {
        let mapper = DrawioMapping::new();
        let doc = RawDrawioDocument {
            diagrams: vec![RawDrawioDiagram {
                name: Some("Empty Page".to_owned()),
                background: None,
                cells: vec![],
                graph_model: Default::default(),
            }],
        };
        let (model, _id_map) = mapper.to_domain(&doc).unwrap();
        assert_eq!(model.page_count(), 1);
    }

    #[test]
    fn test_single_vertex_label_and_style() {
        let mapper = DrawioMapping::new();
        let doc = RawDrawioDocument {
            diagrams: vec![RawDrawioDiagram {
                name: Some("Page-1".to_owned()),
                background: None,
                cells: vec![RawDrawioCell {
                    id: "v1".to_owned(),
                    value: Some("Hi".to_owned()),
                    style: Some("fillColor=#ff0000".to_owned()),
                    vertex: true,
                    edge: false,
                    parent: None,
                    source: None,
                    target: None,
                    geometry: None,
                    extra: Default::default(),
                }],
                graph_model: Default::default(),
            }],
        };
        let (mut model, _id_map) = mapper.to_domain(&doc).unwrap();
        assert_eq!(model.store.len_vertex(), 1);
        assert_eq!(model.store.len_edge(), 0);
        assert_eq!(model.store.len_group(), 0);
        // Find the vertex by iterating over the store
        let vertex = model
            .store
            .vertices_mut()
            .next()
            .expect("expected one vertex");
        assert_eq!(vertex.label.as_ref().map(|l| l.text.as_str()), Some("Hi"));
        // Check style was parsed
        assert!(vertex.style_id.is_some(), "style_id should be set");
        if let Some(sid) = vertex.style_id {
            let smap = model.store.style(sid).unwrap();
            assert_eq!(
                smap.get("fillColor"),
                Some(&diagram_core::style::StyleValue("#ff0000".to_owned()))
            );
        }
    }

    #[test]
    fn test_identical_styles_share_style_id() {
        let mapper = DrawioMapping::new();
        let doc = RawDrawioDocument {
            diagrams: vec![RawDrawioDiagram {
                name: Some("Page-1".to_owned()),
                background: None,
                cells: vec![
                    RawDrawioCell {
                        id: "v1".to_owned(),
                        value: Some("A".to_owned()),
                        style: Some("fillColor=#ff0000".to_owned()),
                        vertex: true,
                        edge: false,
                        parent: None,
                        source: None,
                        target: None,
                        geometry: None,
                        extra: Default::default(),
                    },
                    RawDrawioCell {
                        id: "v2".to_owned(),
                        value: Some("B".to_owned()),
                        style: Some("fillColor=#ff0000".to_owned()),
                        vertex: true,
                        edge: false,
                        parent: None,
                        source: None,
                        target: None,
                        geometry: None,
                        extra: Default::default(),
                    },
                ],
                graph_model: Default::default(),
            }],
        };
        let (model, _id_map) = mapper.to_domain(&doc).unwrap();
        assert_eq!(model.store.len_vertex(), 2);
        assert_eq!(
            model.store.len_style(),
            1,
            "identical styles should share one StyleId"
        );
    }

    #[test]
    fn test_dangling_parent_emits_diagnostic() {
        let mapper = DrawioMapping::new();
        let doc = RawDrawioDocument {
            diagrams: vec![RawDrawioDiagram {
                name: Some("Page-1".to_owned()),
                background: None,
                cells: vec![RawDrawioCell {
                    id: "v1".to_owned(),
                    value: Some("Orphan".to_owned()),
                    style: None,
                    vertex: true,
                    edge: false,
                    parent: Some("nonexistent-group".to_owned()),
                    source: None,
                    target: None,
                    geometry: None,
                    extra: Default::default(),
                }],
                graph_model: Default::default(),
            }],
        };
        let mut diags = Vec::new();
        let (mut model, _id_map) = mapper.to_domain_with_diagnostics(&doc, &mut diags).unwrap();
        // Vertex is still present, but parent should be None
        assert_eq!(model.store.len_vertex(), 1);
        let vertex = model
            .store
            .vertices_mut()
            .next()
            .expect("expected one vertex");
        assert!(
            vertex.parent.is_none(),
            "dangling parent should resolve to None"
        );
        assert!(
            !diags.is_empty(),
            "dangling parent should emit a diagnostic"
        );
    }

    #[test]
    fn test_dangling_edge_source_emits_diagnostic() {
        let mapper = DrawioMapping::new();
        let doc = RawDrawioDocument {
            diagrams: vec![RawDrawioDiagram {
                name: Some("Page-1".to_owned()),
                background: None,
                cells: vec![RawDrawioCell {
                    id: "e1".to_owned(),
                    value: None,
                    style: None,
                    vertex: false,
                    edge: true,
                    parent: None,
                    source: Some("ghost".to_owned()),
                    target: Some("v1".to_owned()),
                    geometry: None,
                    extra: Default::default(),
                }],
                graph_model: Default::default(),
            }],
        };
        let mut diags = Vec::new();
        let (_model, _id_map) = mapper.to_domain_with_diagnostics(&doc, &mut diags).unwrap();
        assert!(
            !diags.is_empty(),
            "dangling edge source should emit at least one diagnostic"
        );
        // Diagnostic message should mention the dangling source
        let has_source_ref = diags.iter().any(|d| d.message.contains("ghost"));
        assert!(
            has_source_ref,
            "diagnostic should mention the dangling source id"
        );
    }

    // =============================================================================
    // Task 25 — format_style_string tests
    // =============================================================================

    #[test]
    fn test_format_style_string_single_segment() {
        use diagram_core::style::{StyleMap, StyleValue};
        let mut smap = StyleMap::new();
        smap.insert("fillColor", StyleValue("#ff0000".to_owned()));
        let result = format_style_string(&smap);
        assert_eq!(result, "fillColor=#ff0000;");
    }

    #[test]
    fn test_format_style_string_multi_segment() {
        use diagram_core::style::{StyleMap, StyleValue};
        let mut smap = StyleMap::new();
        smap.insert("fillColor", StyleValue("#ff0000".to_owned()));
        smap.insert("strokeColor", StyleValue("#0000ff".to_owned()));
        smap.insert("rounded", StyleValue("1".to_owned()));
        let result = format_style_string(&smap);
        // BTreeMap gives lexicographic order: fillColor, rounded, strokeColor
        assert_eq!(result, "fillColor=#ff0000;rounded=1;strokeColor=#0000ff;");
    }

    #[test]
    fn test_format_style_string_empty_value() {
        use diagram_core::style::{StyleMap, StyleValue};
        let mut smap = StyleMap::new();
        smap.insert("dashed", StyleValue("".to_owned()));
        let result = format_style_string(&smap);
        assert_eq!(result, "dashed=;");
    }

    #[test]
    fn test_format_style_string_bare_key() {
        use diagram_core::style::{StyleMap, StyleValue};
        let mut smap = StyleMap::new();
        smap.insert("rounded", StyleValue("".to_owned()));
        let result = format_style_string(&smap);
        assert_eq!(result, "rounded=;");
    }

    #[test]
    fn test_format_style_string_empty_map() {
        use diagram_core::style::StyleMap;
        let smap = StyleMap::new();
        let result = format_style_string(&smap);
        assert_eq!(result, "");
    }

    #[test]
    fn test_format_style_string_roundtrip_identity() {
        use diagram_core::style::{StyleMap, StyleValue};
        let mut smap = StyleMap::new();
        smap.insert("fillColor", StyleValue("#dae8fc".to_owned()));
        smap.insert("strokeColor", StyleValue("#000000".to_owned()));
        smap.insert("rounded", StyleValue("1".to_owned()));
        let serialized = format_style_string(&smap);
        let reparsed = parse_style_string(&serialized);
        // Verify the reparsed map produces the same serialized form
        assert_eq!(format_style_string(&reparsed), serialized);
    }

    // =============================================================================
    // Task 26 — to_raw tests
    // =============================================================================

    #[test]
    fn test_to_raw_single_vertex() {
        let mapper = DrawioMapping::new();
        let doc = RawDrawioDocument {
            diagrams: vec![RawDrawioDiagram {
                name: Some("Page-1".to_owned()),
                background: None,
                cells: vec![RawDrawioCell {
                    id: "v1".to_owned(),
                    value: Some("Test".to_owned()),
                    style: Some("fillColor=#ff0000".to_owned()),
                    vertex: true,
                    edge: false,
                    parent: None,
                    source: None,
                    target: None,
                    geometry: None,
                    extra: Default::default(),
                }],
                graph_model: Default::default(),
            }],
        };
        let (model, id_map) = mapper.to_domain(&doc).unwrap();
        let mut diags = Vec::new();
        let raw = mapper.to_raw(&model, &id_map, &mut diags).unwrap();

        assert_eq!(raw.diagrams.len(), 1);
        assert!(
            diags.is_empty(),
            "should have no diagnostics for well-formed input"
        );
        let cells = &raw.diagrams[0].cells;
        assert_eq!(cells.len(), 1);
        let cell = &cells[0];
        assert_eq!(cell.id, "v1");
        assert_eq!(cell.value.as_deref(), Some("Test"));
        assert!(cell.vertex);
        assert!(!cell.edge);
    }

    #[test]
    fn test_to_raw_single_edge() {
        let mapper = DrawioMapping::new();
        let doc = RawDrawioDocument {
            diagrams: vec![RawDrawioDiagram {
                name: Some("Page-1".to_owned()),
                background: None,
                cells: vec![
                    RawDrawioCell {
                        id: "v1".to_owned(),
                        value: None,
                        style: None,
                        vertex: true,
                        edge: false,
                        parent: None,
                        source: None,
                        target: None,
                        geometry: None,
                        extra: Default::default(),
                    },
                    RawDrawioCell {
                        id: "v2".to_owned(),
                        value: None,
                        style: None,
                        vertex: true,
                        edge: false,
                        parent: None,
                        source: None,
                        target: None,
                        geometry: None,
                        extra: Default::default(),
                    },
                    RawDrawioCell {
                        id: "e1".to_owned(),
                        value: Some("connects".to_owned()),
                        style: Some("edgeStyle=orthogonalEdgeStyle".to_owned()),
                        vertex: false,
                        edge: true,
                        parent: None,
                        source: Some("v1".to_owned()),
                        target: Some("v2".to_owned()),
                        geometry: None,
                        extra: Default::default(),
                    },
                ],
                graph_model: Default::default(),
            }],
        };
        let (model, id_map) = mapper.to_domain(&doc).unwrap();
        let mut diags = Vec::new();
        let raw = mapper.to_raw(&model, &id_map, &mut diags).unwrap();

        assert_eq!(raw.diagrams.len(), 1);
        assert!(diags.is_empty());
        let cells = &raw.diagrams[0].cells;
        // Should have 3 cells: 2 vertices + 1 edge
        assert_eq!(cells.len(), 3);
        let edge_cell = cells.iter().find(|c| c.edge).unwrap();
        assert_eq!(edge_cell.id, "e1");
        assert_eq!(edge_cell.source.as_deref(), Some("v1"));
        assert_eq!(edge_cell.target.as_deref(), Some("v2"));
    }

    #[test]
    fn test_to_raw_single_group() {
        let mapper = DrawioMapping::new();
        let doc = RawDrawioDocument {
            diagrams: vec![RawDrawioDiagram {
                name: Some("Page-1".to_owned()),
                background: None,
                cells: vec![RawDrawioCell {
                    id: "g1".to_owned(),
                    value: Some("Group".to_owned()),
                    style: Some("group=group".to_owned()),
                    vertex: false,
                    edge: false,
                    parent: None,
                    source: None,
                    target: None,
                    geometry: None,
                    extra: Default::default(),
                }],
                graph_model: Default::default(),
            }],
        };
        let (model, id_map) = mapper.to_domain(&doc).unwrap();
        let mut diags = Vec::new();
        let raw = mapper.to_raw(&model, &id_map, &mut diags).unwrap();

        assert_eq!(raw.diagrams.len(), 1);
        assert!(diags.is_empty());
        let cells = &raw.diagrams[0].cells;
        assert_eq!(cells.len(), 1);
        let cell = &cells[0];
        assert_eq!(cell.id, "g1");
        assert!(!cell.vertex);
        assert!(!cell.edge);
    }

    #[test]
    fn test_to_raw_empty_page() {
        let mapper = DrawioMapping::new();
        let doc = RawDrawioDocument {
            diagrams: vec![RawDrawioDiagram {
                name: Some("Empty Page".to_owned()),
                background: None,
                cells: vec![],
                graph_model: Default::default(),
            }],
        };
        let (model, id_map) = mapper.to_domain(&doc).unwrap();
        let mut diags = Vec::new();
        let raw = mapper.to_raw(&model, &id_map, &mut diags).unwrap();

        assert_eq!(raw.diagrams.len(), 1);
        assert_eq!(raw.diagrams[0].name.as_deref(), Some("Empty Page"));
        assert!(raw.diagrams[0].cells.is_empty());
        assert!(diags.is_empty());
    }

    #[test]
    fn test_to_raw_multi_page_partitioning() {
        let mapper = DrawioMapping::new();
        let doc = RawDrawioDocument {
            diagrams: vec![
                RawDrawioDiagram {
                    name: Some("Page-1".to_owned()),
                    background: None,
                    cells: vec![RawDrawioCell {
                        id: "v1".to_owned(),
                        value: Some("First".to_owned()),
                        style: None,
                        vertex: true,
                        edge: false,
                        parent: None,
                        source: None,
                        target: None,
                        geometry: None,
                        extra: Default::default(),
                    }],
                    graph_model: Default::default(),
                },
                RawDrawioDiagram {
                    name: Some("Page-2".to_owned()),
                    background: None,
                    cells: vec![RawDrawioCell {
                        id: "v2".to_owned(),
                        value: Some("Second".to_owned()),
                        style: None,
                        vertex: true,
                        edge: false,
                        parent: None,
                        source: None,
                        target: None,
                        geometry: None,
                        extra: Default::default(),
                    }],
                    graph_model: Default::default(),
                },
            ],
        };
        let (model, id_map) = mapper.to_domain(&doc).unwrap();
        let mut diags = Vec::new();
        let raw = mapper.to_raw(&model, &id_map, &mut diags).unwrap();

        assert_eq!(raw.diagrams.len(), 2);
        assert!(diags.is_empty());
        assert_eq!(raw.diagrams[0].cells.len(), 1);
        assert_eq!(raw.diagrams[0].cells[0].value.as_deref(), Some("First"));
        assert_eq!(raw.diagrams[1].cells.len(), 1);
        assert_eq!(raw.diagrams[1].cells[0].value.as_deref(), Some("Second"));
    }

    // =============================================================================
    // synthesize_id_map tests
    // =============================================================================

    #[test]
    fn test_synthesize_id_map_empty_model() {
        let model = DiagramModel::new();
        let id_map = synthesize_id_map(&model);
        assert!(id_map.is_empty());
    }

    #[test]
    fn test_synthesize_id_map_single_vertex() {
        let mapper = DrawioMapping::new();
        let doc = RawDrawioDocument {
            diagrams: vec![RawDrawioDiagram {
                name: Some("Page-1".to_owned()),
                background: None,
                cells: vec![RawDrawioCell {
                    id: "v-original".to_owned(),
                    value: Some("Test".to_owned()),
                    style: None,
                    vertex: true,
                    edge: false,
                    parent: None,
                    source: None,
                    target: None,
                    geometry: None,
                    extra: Default::default(),
                }],
                graph_model: Default::default(),
            }],
        };
        let (model, _id_map) = mapper.to_domain(&doc).unwrap();
        let synthesized = synthesize_id_map(&model);

        assert_eq!(synthesized.vertices.len(), 1);
        assert!(synthesized.edges.is_empty());
        assert!(synthesized.groups.is_empty());
        // The key should be "v0" regardless of the original raw ID
        let vid = model.store.vertices_with_ids().next().unwrap().0;
        assert_eq!(synthesized.get_external_vertex(vid), Some("v0".to_owned()));
    }

    #[test]
    fn test_synthesize_id_map_multiple_vertices_sequential_ids() {
        let mapper = DrawioMapping::new();
        let doc = RawDrawioDocument {
            diagrams: vec![RawDrawioDiagram {
                name: Some("Page-1".to_owned()),
                background: None,
                cells: vec![
                    RawDrawioCell {
                        id: "first".to_owned(),
                        value: Some("A".to_owned()),
                        style: None,
                        vertex: true,
                        edge: false,
                        parent: None,
                        source: None,
                        target: None,
                        geometry: None,
                        extra: Default::default(),
                    },
                    RawDrawioCell {
                        id: "second".to_owned(),
                        value: Some("B".to_owned()),
                        style: None,
                        vertex: true,
                        edge: false,
                        parent: None,
                        source: None,
                        target: None,
                        geometry: None,
                        extra: Default::default(),
                    },
                    RawDrawioCell {
                        id: "third".to_owned(),
                        value: Some("C".to_owned()),
                        style: None,
                        vertex: true,
                        edge: false,
                        parent: None,
                        source: None,
                        target: None,
                        geometry: None,
                        extra: Default::default(),
                    },
                ],
                graph_model: Default::default(),
            }],
        };
        let (model, _id_map) = mapper.to_domain(&doc).unwrap();
        let synthesized = synthesize_id_map(&model);

        let vertices: Vec<_> = model.store.vertices_with_ids().collect();
        assert_eq!(vertices.len(), 3);
        assert_eq!(
            synthesized.get_external_vertex(vertices[0].0),
            Some("v0".to_owned())
        );
        assert_eq!(
            synthesized.get_external_vertex(vertices[1].0),
            Some("v1".to_owned())
        );
        assert_eq!(
            synthesized.get_external_vertex(vertices[2].0),
            Some("v2".to_owned())
        );
    }

    #[test]
    fn test_synthesize_id_map_mixed_cells() {
        let mapper = DrawioMapping::new();
        let doc = RawDrawioDocument {
            diagrams: vec![RawDrawioDiagram {
                name: Some("Page-1".to_owned()),
                background: None,
                cells: vec![
                    RawDrawioCell {
                        id: "v1".to_owned(),
                        value: Some("A".to_owned()),
                        style: None,
                        vertex: true,
                        edge: false,
                        parent: None,
                        source: None,
                        target: None,
                        geometry: None,
                        extra: Default::default(),
                    },
                    RawDrawioCell {
                        id: "v2".to_owned(),
                        value: Some("B".to_owned()),
                        style: None,
                        vertex: true,
                        edge: false,
                        parent: None,
                        source: None,
                        target: None,
                        geometry: None,
                        extra: Default::default(),
                    },
                    RawDrawioCell {
                        id: "e1".to_owned(),
                        value: None,
                        style: None,
                        vertex: false,
                        edge: true,
                        parent: None,
                        source: Some("v1".to_owned()),
                        target: Some("v2".to_owned()),
                        geometry: None,
                        extra: Default::default(),
                    },
                    RawDrawioCell {
                        id: "g1".to_owned(),
                        value: Some("Group".to_owned()),
                        style: None,
                        vertex: false,
                        edge: false,
                        parent: None,
                        source: None,
                        target: None,
                        geometry: None,
                        extra: Default::default(),
                    },
                ],
                graph_model: Default::default(),
            }],
        };
        let (model, _id_map) = mapper.to_domain(&doc).unwrap();
        let synthesized = synthesize_id_map(&model);

        // Vertices get v0, v1
        assert_eq!(synthesized.vertices.len(), 2);
        // Edge gets e0
        assert_eq!(synthesized.edges.len(), 1);
        // Group gets g0
        assert_eq!(synthesized.groups.len(), 1);
    }

    // =============================================================================
    // Task 1.2 — Swimlane style-based classification
    // =============================================================================

    #[test]
    fn test_swimlane_vertex_classified_as_group_no_orphan() {
        // A cell with vertex=1 but style containing "swimlane" must be classified
        // as a Group, not a Vertex. This prevents an OrphanedShape diagnostic
        // (a group does not require a parent the way a vertex does).
        let mapper = DrawioMapping::new();
        let doc = RawDrawioDocument {
            diagrams: vec![RawDrawioDiagram {
                name: Some("Swimlane Page".to_owned()),
                background: None,
                cells: vec![RawDrawioCell {
                    id: "pool".to_owned(),
                    value: Some("Pool 1".to_owned()),
                    // vertex=1 but style contains "swimlane" → should be Group
                    style: Some("swimlane".to_owned()),
                    vertex: true,
                    edge: false,
                    parent: None,
                    source: None,
                    target: None,
                    geometry: None,
                    extra: Default::default(),
                }],
                graph_model: Default::default(),
            }],
        };
        let mut diags = Vec::new();
        let (model, _id_map) = mapper.to_domain_with_diagnostics(&doc, &mut diags).unwrap();

        // Must be a group, not a vertex
        assert_eq!(
            model.store.len_group(),
            1,
            "swimlane cell must be classified as Group"
        );
        assert_eq!(
            model.store.len_vertex(),
            0,
            "swimlane cell must NOT be a Vertex"
        );

        // No OrphanedShape diagnostic (groups don't require parents)
        let orphaned = diags
            .iter()
            .filter(|d| d.message.contains("orphan"))
            .count();
        assert_eq!(orphaned, 0, "no orphan diagnostics for swimlane group");
    }

    #[test]
    fn test_swimlane_child_vertex_with_parent_linkage() {
        // A normal vertex that is a child of a swimlane group must carry the
        // correct parent GroupId.
        let mapper = DrawioMapping::new();
        let doc = RawDrawioDocument {
            diagrams: vec![RawDrawioDiagram {
                name: Some("Swimlane Page".to_owned()),
                background: None,
                cells: vec![
                    // Pool (swimlane, top-level, parent=None)
                    RawDrawioCell {
                        id: "pool".to_owned(),
                        value: Some("Pool 1".to_owned()),
                        style: Some("swimlane".to_owned()),
                        vertex: true,
                        edge: false,
                        parent: None,
                        source: None,
                        target: None,
                        geometry: None,
                        extra: Default::default(),
                    },
                    // Shape inside the pool (normal vertex, parent=pool)
                    RawDrawioCell {
                        id: "s1".to_owned(),
                        value: Some("Task A".to_owned()),
                        style: None,
                        vertex: true,
                        edge: false,
                        parent: Some("pool".to_owned()),
                        source: None,
                        target: None,
                        geometry: None,
                        extra: Default::default(),
                    },
                ],
                graph_model: Default::default(),
            }],
        };
        let mut diags = Vec::new();
        let (model, id_map) = mapper.to_domain_with_diagnostics(&doc, &mut diags).unwrap();

        assert_eq!(model.store.len_group(), 1, "pool is a group");
        assert_eq!(model.store.len_vertex(), 1, "s1 is a vertex");

        // The vertex's parent must point to the pool's GroupId
        let pool_gid = id_map
            .get_internal_group("pool")
            .expect("pool must be mapped");
        let s1_vertex = model.store.vertices_with_ids().find(|(_, v)| {
            v.label
                .as_ref()
                .map(|l| l.text.as_str() == "Task A")
                .unwrap_or(false)
        });
        let (_, s1) = s1_vertex.expect("Task A vertex must exist");
        assert_eq!(
            s1.parent,
            Some(pool_gid),
            "vertex parent must reference pool group"
        );

        // No orphaned-shape diagnostics
        let orphaned = diags
            .iter()
            .filter(|d| d.message.contains("orphan"))
            .count();
        assert_eq!(orphaned, 0, "no orphan diagnostics");
    }

    // =============================================================================
    // Task 1.8 — Round-trip: group.parent preserved through to_raw → re-parse
    // =============================================================================

    #[test]
    fn test_group_parent_roundtrip() {
        // A nested group (lane inside a pool) must preserve its parent linkage
        // through: to_domain → to_raw → to_domain again.
        let mapper = DrawioMapping::new();
        let doc = RawDrawioDocument {
            diagrams: vec![RawDrawioDiagram {
                name: Some("Roundtrip Page".to_owned()),
                background: None,
                cells: vec![
                    RawDrawioCell {
                        id: "pool".to_owned(),
                        value: Some("Pool".to_owned()),
                        style: Some("swimlane".to_owned()),
                        vertex: true,
                        edge: false,
                        parent: None,
                        source: None,
                        target: None,
                        geometry: None,
                        extra: Default::default(),
                    },
                    RawDrawioCell {
                        id: "lane".to_owned(),
                        value: Some("Lane".to_owned()),
                        style: Some("swimlane".to_owned()),
                        vertex: true,
                        edge: false,
                        parent: Some("pool".to_owned()),
                        source: None,
                        target: None,
                        geometry: None,
                        extra: Default::default(),
                    },
                ],
                graph_model: Default::default(),
            }],
        };

        // First parse
        let (model1, id_map1) = mapper.to_domain(&doc).unwrap();
        assert_eq!(model1.store.len_group(), 2, "two groups: pool and lane");

        // Verify lane's parent is pool
        let pool_gid = id_map1.get_internal_group("pool").unwrap();
        let lane_gid = id_map1.get_internal_group("lane").unwrap();
        let lane = model1.store.group(lane_gid).unwrap();
        assert_eq!(lane.parent, Some(pool_gid), "lane.parent must be pool");

        // Export to raw
        let mut diags = Vec::new();
        let raw = mapper.to_raw(&model1, &id_map1, &mut diags).unwrap();
        assert!(diags.is_empty(), "to_raw should have no diagnostics");

        // Re-parse the raw document
        let (model2, id_map2) = mapper.to_domain(&raw).unwrap();
        assert_eq!(
            model2.store.len_group(),
            2,
            "still two groups after round-trip"
        );

        // Verify lane's parent survived the round-trip
        let pool_gid2 = id_map2.get_internal_group("pool").unwrap();
        let lane_gid2 = id_map2.get_internal_group("lane").unwrap();
        let lane2 = model2.store.group(lane_gid2).unwrap();
        assert_eq!(
            lane2.parent,
            Some(pool_gid2),
            "lane.parent must survive round-trip"
        );
    }
}
