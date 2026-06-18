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
use diagram_core::label::Label;
use diagram_core::{DiagramModel, Edge, Group, Page, Vertex};

use crate::error::{Diagnostic, FormatResult};
use crate::raw::RawDrawioDocument;

/// Maps a raw `.drawio` cell ID to its engine-owned identifier.
type IdMap = BTreeMap<String, CellRef>;

/// A reference to a cell's allocated engine ID, tagged by kind.
enum CellRef {
    /// The cell is a vertex.
    Vertex(diagram_core::id::VertexId),
    /// The cell is an edge.
    Edge(diagram_core::id::EdgeId),
    /// The cell is a group.
    Group(diagram_core::id::GroupId),
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
    pub fn to_domain(&self, raw: &RawDrawioDocument) -> FormatResult<DiagramModel> {
        let mut diags = Vec::new();
        self.to_domain_with_diagnostics(raw, &mut diags)
    }

    /// Convert a [`RawDrawioDocument`] into a [`DiagramModel`], collecting diagnostics.
    pub fn to_domain_with_diagnostics(
        &self,
        raw: &RawDrawioDocument,
        diags: &mut Vec<Diagnostic>,
    ) -> FormatResult<DiagramModel> {
        let mut model = DiagramModel::new();
        let mut id_map: IdMap = IdMap::new();

        // For each raw diagram, insert a page with no name yet
        for _diagram in &raw.diagrams {
            // Insert a placeholder page; the slotmap key IS the page ID
            model.store.insert_page(Page::new(Default::default()));
        }

        // Set page names from diagram names (pages_mut() returns pages in insertion order)
        for (page, diagram) in model.store.pages_mut().zip(raw.diagrams.iter()) {
            page.name = diagram.name.as_ref().map(|n| Label::new(n.as_str()));
        }

        // PASS 1 — Forward sweep: allocate placeholder entries, record raw→engine ID
        for diagram in &raw.diagrams {
            for cell in &diagram.cells {
                if cell.vertex && !cell.edge {
                    let vid = model.store.insert_vertex(Vertex::default());
                    id_map.insert(cell.id.clone(), CellRef::Vertex(vid));
                } else if cell.edge && !cell.vertex {
                    let eid = model.store.insert_edge(Edge::default());
                    id_map.insert(cell.id.clone(), CellRef::Edge(eid));
                } else {
                    // Group container (neither vertex nor edge)
                    let gid = model.store.insert_group(Group::default());
                    id_map.insert(cell.id.clone(), CellRef::Group(gid));
                }
            }
        }

        // PASS 2 — Backward sweep: resolve, materialize, attach styles
        let mut style_cache: BTreeMap<String, diagram_core::id::StyleId> = BTreeMap::new();

        for diagram in &raw.diagrams {
            for cell in &diagram.cells {
                let cell_ref = match id_map.get(&cell.id) {
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
                    .map(|geo| CellGeometry {
                        x: geo.x,
                        y: geo.y,
                        width: geo.width,
                        height: geo.height,
                        relative: geo.r#as != "geometry",
                    });

                match cell_ref {
                    CellRef::Vertex(vid) => {
                        let label = cell.value.as_ref().map(|v| Label::new(v.as_str()));
                        let parent = resolve_parent(&cell.parent, &id_map, diags);
                        let vertex = Vertex {
                            geometry: cell_geo,
                            label,
                            style_id,
                            parent,
                        };
                        model.store.replace_vertex(*vid, vertex);
                    }
                    CellRef::Group(gid) => {
                        let label = cell.value.as_ref().map(|v| Label::new(v.as_str()));
                        let group = Group {
                            geometry: cell_geo,
                            label,
                            style_id,
                        };
                        model.store.replace_group(*gid, group);
                    }
                    CellRef::Edge(eid) => {
                        // Resolve source and target to VertexIds
                        let source_id = cell
                            .source
                            .as_ref()
                            .and_then(|sid| id_map.get(sid))
                            .and_then(|r| match r {
                                CellRef::Vertex(vid) => Some(*vid),
                                _ => None,
                            });
                        let target_id = cell
                            .target
                            .as_ref()
                            .and_then(|tid| id_map.get(tid))
                            .and_then(|r| match r {
                                CellRef::Vertex(vid) => Some(*vid),
                                _ => None,
                            });

                        match (source_id, target_id) {
                            (Some(source), Some(target)) => {
                                let label = cell.value.as_ref().map(|v| Label::new(v.as_str()));
                                let edge = Edge {
                                    label,
                                    style_id,
                                    source,
                                    target,
                                };
                                model.store.replace_edge(*eid, edge);
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
                                model.store.remove_edge(*eid);
                            }
                        }
                    }
                }
            }
        }

        Ok(model)
    }
}

/// Resolve a raw `parent` string to a `GroupId`, emitting a diagnostic if dangling.
fn resolve_parent(
    parent: &Option<String>,
    id_map: &IdMap,
    diags: &mut Vec<Diagnostic>,
) -> Option<diagram_core::id::GroupId> {
    let sid = parent.as_ref()?;
    match id_map.get(sid) {
        Some(CellRef::Group(gid)) => Some(*gid),
        _ => {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::raw::{RawDrawioCell, RawDrawioDiagram, RawDrawioDocument};

    #[test]
    fn test_empty_document_page_count_zero() {
        let mapper = DrawioMapping::new();
        let doc = RawDrawioDocument { diagrams: vec![] };
        let model = mapper.to_domain(&doc).unwrap();
        assert_eq!(model.page_count(), 0);
    }

    #[test]
    fn test_empty_diagram_page_count_one() {
        let mapper = DrawioMapping::new();
        let doc = RawDrawioDocument {
            diagrams: vec![RawDrawioDiagram {
                name: Some("Empty Page".to_owned()),
                cells: vec![],
            }],
        };
        let model = mapper.to_domain(&doc).unwrap();
        assert_eq!(model.page_count(), 1);
    }

    #[test]
    fn test_single_vertex_label_and_style() {
        let mapper = DrawioMapping::new();
        let doc = RawDrawioDocument {
            diagrams: vec![RawDrawioDiagram {
                name: Some("Page-1".to_owned()),
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
            }],
        };
        let mut model = mapper.to_domain(&doc).unwrap();
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
            }],
        };
        let model = mapper.to_domain(&doc).unwrap();
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
            }],
        };
        let mut diags = Vec::new();
        let mut model = mapper.to_domain_with_diagnostics(&doc, &mut diags).unwrap();
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
            }],
        };
        let mut diags = Vec::new();
        mapper.to_domain_with_diagnostics(&doc, &mut diags).unwrap();
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
}
