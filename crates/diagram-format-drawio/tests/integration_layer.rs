//! Integration tests for layer round-trip (layer-drawio-roundtrip capability).
//!
//! Tests cover:
//! - Parser detects layer cells (mxCell with vertex=1 and style containing layer=1)
//! - Mapping creates Layer entries and sets layer_id on child cells
//! - Writer emits layer cells with proper style and parent attributes
//! - Round-trip preserves layer information through parse → map → unmap → write
//!
//! Run with:
//!   cargo test -p diagram-format-drawio --test integration_layer

use diagram_format_drawio::{DrawioMapping, parse_drawio, write_drawio};

/// A draw.io XML with two layers and shapes in each layer.
const XML_WITH_TWO_LAYERS: &str = r#"<mxfile>
  <diagram name="Page-1">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1"/>
        <mxCell id="2" value="Layer 1" vertex="1" style="layer=1" parent="1"/>
        <mxCell id="3" value="Shape A" vertex="1" parent="2"/>
        <mxCell id="4" value="Shape B" vertex="1" parent="2"/>
        <mxCell id="5" value="Layer 2" vertex="1" style="layer=1" parent="1"/>
        <mxCell id="6" value="Shape C" vertex="1" parent="5"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>"#;

/// A draw.io XML with three layers (3-layer round-trip fixture).
const XML_WITH_THREE_LAYERS: &str = r#"<mxfile>
  <diagram name="Page-1">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1"/>
        <mxCell id="2" value="Background" vertex="1" style="layer=1" parent="1"/>
        <mxCell id="3" value="Rect A" vertex="1" parent="2">
          <mxGeometry x="10" y="10" width="80" height="40"/>
        </mxCell>
        <mxCell id="4" value="Rect B" vertex="1" parent="2">
          <mxGeometry x="100" y="10" width="80" height="40"/>
        </mxCell>
        <mxCell id="5" value="Content" vertex="1" style="layer=1" parent="1"/>
        <mxCell id="6" value="Rect C" vertex="1" parent="5">
          <mxGeometry x="10" y="60" width="80" height="40"/>
        </mxCell>
        <mxCell id="7" value="Rect D" vertex="1" parent="5">
          <mxGeometry x="100" y="60" width="80" height="40"/>
        </mxCell>
        <mxCell id="8" value="Annotations" vertex="1" style="layer=1" parent="1"/>
        <mxCell id="9" value="Rect E" vertex="1" parent="8">
          <mxGeometry x="10" y="110" width="80" height="40"/>
        </mxCell>
        <mxCell id="10" value="Connector" edge="1" source="3" target="6">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>"#;

/// A draw.io XML with default layer only (no explicit layers).
const XML_DEFAULT_LAYER_ONLY: &str = r#"<mxfile>
  <diagram name="Page-1">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1"/>
        <mxCell id="2" value="Shape A" vertex="1" parent="1">
          <mxGeometry x="10" y="10" width="80" height="40"/>
        </mxCell>
        <mxCell id="3" value="Shape B" vertex="1" parent="1">
          <mxGeometry x="100" y="10" width="80" height="40"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>"#;

#[test]
fn parser_detects_layer_cells() {
    let doc = parse_drawio(XML_WITH_TWO_LAYERS).unwrap();
    assert_eq!(doc.diagrams.len(), 1);

    let cells = &doc.diagrams[0].cells;
    // Find layer cells
    let layer_cells: Vec<_> = cells
        .iter()
        .filter(|c| {
            c.vertex
                && c.style
                    .as_ref()
                    .map(|s| s.contains("layer=1"))
                    .unwrap_or(false)
        })
        .collect();

    assert_eq!(layer_cells.len(), 2, "should detect 2 layer cells");
    assert_eq!(layer_cells[0].value.as_deref(), Some("Layer 1"));
    assert_eq!(layer_cells[1].value.as_deref(), Some("Layer 2"));
}

#[test]
fn mapping_creates_layers_from_drawio() {
    let doc = parse_drawio(XML_WITH_TWO_LAYERS).unwrap();
    let mapper = DrawioMapping::new();
    let (model, _id_map) = mapper.to_domain(&doc).unwrap();

    // Should have 2 named layers (no default layer created from draw.io - it's implicit via layer_id=None)
    assert_eq!(model.store.len_layer(), 2, "should have 2 named layers");

    // Check that named layers exist
    let layers: Vec<_> = model
        .store
        .layers_with_ids()
        .map(|(_, l)| {
            (
                l.name.as_ref().map(|n| n.text.as_str()),
                l.visible,
                l.locked,
            )
        })
        .collect();

    let named_layers: Vec<_> = layers
        .iter()
        .filter(|(name, _, _)| name.is_some())
        .collect();
    assert_eq!(named_layers.len(), 2, "should have 2 named layers");

    let layer_names: Vec<_> = named_layers.iter().map(|(name, _, _)| *name).collect();
    assert!(layer_names.contains(&Some("Layer 1")));
    assert!(layer_names.contains(&Some("Layer 2")));
}

#[test]
fn mapping_assigns_layer_id_to_shapes() {
    let doc = parse_drawio(XML_WITH_TWO_LAYERS).unwrap();
    let mapper = DrawioMapping::new();
    let (model, _id_map) = mapper.to_domain(&doc).unwrap();

    // Find the named layers
    let layer_ids: Vec<_> = model
        .store
        .layers_with_ids()
        .filter(|(_, l)| l.name.is_some())
        .map(|(id, _)| id)
        .collect();

    assert_eq!(layer_ids.len(), 2, "should have 2 named layer IDs");

    // Get all vertices and check their layer_id
    let vertices: Vec<_> = model
        .store
        .vertices_with_ids()
        .map(|(vid, v)| (vid, v.label.as_ref().map(|l| l.text.as_str()), v.layer_id))
        .collect();

    // Shape A and B should be in Layer 1
    let shape_a = vertices
        .iter()
        .find(|(_, label, _)| *label == Some("Shape A"))
        .unwrap();
    let shape_b = vertices
        .iter()
        .find(|(_, label, _)| *label == Some("Shape B"))
        .unwrap();
    // Shape C should be in Layer 2
    let shape_c = vertices
        .iter()
        .find(|(_, label, _)| *label == Some("Shape C"))
        .unwrap();

    assert_eq!(
        shape_a.2,
        Some(layer_ids[0]),
        "Shape A should be in Layer 1"
    );
    assert_eq!(
        shape_b.2,
        Some(layer_ids[0]),
        "Shape B should be in Layer 1"
    );
    assert_eq!(
        shape_c.2,
        Some(layer_ids[1]),
        "Shape C should be in Layer 2"
    );
}

#[test]
fn mapping_default_layer_has_no_name() {
    let doc = parse_drawio(XML_DEFAULT_LAYER_ONLY).unwrap();
    let mapper = DrawioMapping::new();
    let (model, _id_map) = mapper.to_domain(&doc).unwrap();

    // With no explicit layer cells in draw.io XML, no layers are created
    // Shapes with parent="1" (root) have layer_id = None (default layer)
    assert_eq!(
        model.store.len_layer(),
        0,
        "no layers created when draw.io has no layer cells"
    );

    // All shapes should have layer_id = None (default layer)
    let vertices: Vec<_> = model
        .store
        .vertices_with_ids()
        .map(|(vid, v)| (vid, v.label.as_ref().map(|l| l.text.as_str()), v.layer_id))
        .collect();

    for (_, label, layer_id) in vertices {
        assert!(
            layer_id.is_none(),
            "Shape {} should have layer_id=None (default layer)",
            label.unwrap_or("(unnamed)")
        );
    }
}

#[test]
fn writer_emits_layer_cells() {
    let doc = parse_drawio(XML_WITH_TWO_LAYERS).unwrap();
    let mapper = DrawioMapping::new();
    let (model, id_map) = mapper.to_domain(&doc).unwrap();

    let mut diags = Vec::new();
    let raw = mapper.to_raw(&model, &id_map, &mut diags).unwrap();

    let output = write_drawio(&raw).unwrap();

    // Output should contain layer=1 style attribute
    assert!(
        output.contains("layer=1"),
        "output should contain layer=1 style: {}",
        output
    );

    // Should have layer cells with vertex=1
    let layer_cell_count = raw.diagrams[0]
        .cells
        .iter()
        .filter(|c| {
            c.vertex
                && c.style
                    .as_ref()
                    .map(|s| s.contains("layer=1"))
                    .unwrap_or(false)
        })
        .count();
    assert_eq!(layer_cell_count, 2, "should emit 2 layer cells");
}

#[test]
fn writer_sets_parent_to_layer_for_shapes() {
    let doc = parse_drawio(XML_WITH_TWO_LAYERS).unwrap();
    let mapper = DrawioMapping::new();
    let (model, id_map) = mapper.to_domain(&doc).unwrap();

    let mut diags = Vec::new();
    let raw = mapper.to_raw(&model, &id_map, &mut diags).unwrap();

    // Find the layer cell IDs
    let layer_cells: Vec<_> = raw.diagrams[0]
        .cells
        .iter()
        .filter(|c| {
            c.vertex
                && c.style
                    .as_ref()
                    .map(|s| s.contains("layer=1"))
                    .unwrap_or(false)
        })
        .collect();

    assert_eq!(layer_cells.len(), 2);

    let layer_1_id = layer_cells
        .iter()
        .find(|c| c.value.as_deref() == Some("Layer 1"))
        .unwrap()
        .id
        .as_str();
    let layer_2_id = layer_cells
        .iter()
        .find(|c| c.value.as_deref() == Some("Layer 2"))
        .unwrap()
        .id
        .as_str();

    // Find shape cells and check their parent
    let shape_a_cell = raw.diagrams[0]
        .cells
        .iter()
        .find(|c| c.value.as_deref() == Some("Shape A"))
        .unwrap();
    let shape_c_cell = raw.diagrams[0]
        .cells
        .iter()
        .find(|c| c.value.as_deref() == Some("Shape C"))
        .unwrap();

    assert_eq!(
        shape_a_cell.parent.as_deref(),
        Some(layer_1_id),
        "Shape A parent should be Layer 1"
    );
    assert_eq!(
        shape_c_cell.parent.as_deref(),
        Some(layer_2_id),
        "Shape C parent should be Layer 2"
    );
}

#[test]
fn roundtrip_preserves_three_layers() {
    // Parse the 3-layer fixture
    let doc = parse_drawio(XML_WITH_THREE_LAYERS).unwrap();

    // Map to domain
    let mapper = DrawioMapping::new();
    let (model, id_map) = mapper.to_domain(&doc).unwrap();

    // Should have 3 named layers (no default layer created - it's represented as layer_id=None)
    let layer_count = model.store.len_layer();
    assert_eq!(layer_count, 3, "should have 3 named layers");

    // Verify shapes are in correct layers
    let vertices: Vec<_> = model
        .store
        .vertices_with_ids()
        .map(|(vid, v)| (vid, v.label.as_ref().map(|l| l.text.as_str()), v.layer_id))
        .collect();

    let layers: Vec<_> = model
        .store
        .layers_with_ids()
        .filter(|(_, l)| l.name.is_some())
        .map(|(id, l)| (id, l.name.as_ref().map(|n| n.text.as_str())))
        .collect();

    let bg_layer_id = layers
        .iter()
        .find(|(_, name)| *name == Some("Background"))
        .map(|(id, _)| *id);
    let content_layer_id = layers
        .iter()
        .find(|(_, name)| *name == Some("Content"))
        .map(|(id, _)| *id);
    let annot_layer_id = layers
        .iter()
        .find(|(_, name)| *name == Some("Annotations"))
        .map(|(id, _)| *id);

    // Rect A and B should be in Background layer
    let rect_a = vertices
        .iter()
        .find(|(_, label, _)| *label == Some("Rect A"))
        .unwrap();
    let rect_b = vertices
        .iter()
        .find(|(_, label, _)| *label == Some("Rect B"))
        .unwrap();
    assert_eq!(
        rect_a.2, bg_layer_id,
        "Rect A should be in Background layer"
    );
    assert_eq!(
        rect_b.2, bg_layer_id,
        "Rect B should be in Background layer"
    );

    // Rect C and D should be in Content layer
    let rect_c = vertices
        .iter()
        .find(|(_, label, _)| *label == Some("Rect C"))
        .unwrap();
    let rect_d = vertices
        .iter()
        .find(|(_, label, _)| *label == Some("Rect D"))
        .unwrap();
    assert_eq!(
        rect_c.2, content_layer_id,
        "Rect C should be in Content layer"
    );
    assert_eq!(
        rect_d.2, content_layer_id,
        "Rect D should be in Content layer"
    );

    // Rect E should be in Annotations layer
    let rect_e = vertices
        .iter()
        .find(|(_, label, _)| *label == Some("Rect E"))
        .unwrap();
    assert_eq!(
        rect_e.2, annot_layer_id,
        "Rect E should be in Annotations layer"
    );

    // Map back to raw and write
    let mut diags = Vec::new();
    let raw = mapper.to_raw(&model, &id_map, &mut diags).unwrap();
    let output = write_drawio(&raw).unwrap();

    // Verify output contains all three layer names
    assert!(
        output.contains("Background"),
        "output should contain Background layer"
    );
    assert!(
        output.contains("Content"),
        "output should contain Content layer"
    );
    assert!(
        output.contains("Annotations"),
        "output should contain Annotations layer"
    );

    // Verify shapes have correct parents
    let reparsed = parse_drawio(&output).unwrap();

    // Find layer IDs in reparsed
    let reparsed_layers: Vec<_> = reparsed.diagrams[0]
        .cells
        .iter()
        .filter(|c| {
            c.vertex
                && c.style
                    .as_ref()
                    .map(|s| s.contains("layer=1"))
                    .unwrap_or(false)
        })
        .collect();

    let bg_id = reparsed_layers
        .iter()
        .find(|c| c.value.as_deref() == Some("Background"))
        .unwrap()
        .id
        .as_str();
    let content_id = reparsed_layers
        .iter()
        .find(|c| c.value.as_deref() == Some("Content"))
        .unwrap()
        .id
        .as_str();
    let annot_id = reparsed_layers
        .iter()
        .find(|c| c.value.as_deref() == Some("Annotations"))
        .unwrap()
        .id
        .as_str();

    // Check Rect A parent
    let rect_a_reparsed = reparsed.diagrams[0]
        .cells
        .iter()
        .find(|c| c.value.as_deref() == Some("Rect A"))
        .unwrap();
    assert_eq!(
        rect_a_reparsed.parent.as_deref(),
        Some(bg_id),
        "Rect A parent should be Background"
    );

    // Check Rect C parent
    let rect_c_reparsed = reparsed.diagrams[0]
        .cells
        .iter()
        .find(|c| c.value.as_deref() == Some("Rect C"))
        .unwrap();
    assert_eq!(
        rect_c_reparsed.parent.as_deref(),
        Some(content_id),
        "Rect C parent should be Content"
    );

    // Check Rect E parent
    let rect_e_reparsed = reparsed.diagrams[0]
        .cells
        .iter()
        .find(|c| c.value.as_deref() == Some("Rect E"))
        .unwrap();
    assert_eq!(
        rect_e_reparsed.parent.as_deref(),
        Some(annot_id),
        "Rect E parent should be Annotations"
    );
}

#[test]
fn roundtrip_preserves_default_layer_no_explicit_layers() {
    // Parse XML with no explicit layers
    let doc = parse_drawio(XML_DEFAULT_LAYER_ONLY).unwrap();

    // Map to domain
    let mapper = DrawioMapping::new();
    let (model, id_map) = mapper.to_domain(&doc).unwrap();

    // With no explicit layer cells, no layers are created in the store
    assert_eq!(
        model.store.len_layer(),
        0,
        "no layers created when draw.io has no layer cells"
    );

    // All shapes should have layer_id = None (default layer)
    let vertices: Vec<_> = model
        .store
        .vertices_with_ids()
        .map(|(vid, v)| (vid, v.label.as_ref().map(|l| l.text.as_str()), v.layer_id))
        .collect();

    for (_, label, layer_id) in vertices {
        assert!(
            layer_id.is_none(),
            "Shape {} should be in default layer (None)",
            label.unwrap_or("(unnamed)")
        );
    }

    // Map back to raw and write
    let mut diags = Vec::new();
    let raw = mapper.to_raw(&model, &id_map, &mut diags).unwrap();
    let output = write_drawio(&raw).unwrap();

    // Output should NOT contain layer=1 (no explicit layers)
    assert!(
        !output.contains("layer=1"),
        "output should NOT contain layer=1 when no explicit layers: {}",
        output
    );
}

#[test]
fn layer_cell_not_vertex_or_edge() {
    // A layer cell has vertex=1 but is not a regular vertex - it's a container
    // The mapping should treat it as a Layer, not as a Vertex
    let doc = parse_drawio(XML_WITH_TWO_LAYERS).unwrap();
    let mapper = DrawioMapping::new();
    let (model, _id_map) = mapper.to_domain(&doc).unwrap();

    // If layer cells were treated as vertices, we'd have more vertices
    // With proper layer detection, we should have exactly 3 vertices (Shape A, B, C)
    let vertex_count = model.store.len_vertex();
    assert_eq!(
        vertex_count, 3,
        "should have 3 vertices (Shape A, B, C), not 5"
    );
}

#[test]
fn layer_visible_and_locked_from_extra_attributes() {
    // Test that layer's visible and locked attributes are read from extra attributes
    let xml = r#"<mxfile>
  <diagram name="Page-1">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1"/>
        <mxCell id="2" value="Hidden Layer" vertex="1" style="layer=1" parent="1" visible="0"/>
        <mxCell id="3" value="Locked Layer" vertex="1" style="layer=1" parent="1" locked="1"/>
        <mxCell id="4" value="Normal Layer" vertex="1" style="layer=1" parent="1"/>
        <mxCell id="5" value="Shape A" vertex="1" parent="2"/>
        <mxCell id="6" value="Shape B" vertex="1" parent="3"/>
        <mxCell id="7" value="Shape C" vertex="1" parent="4"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>"#;

    let doc = parse_drawio(xml).unwrap();
    let mapper = DrawioMapping::new();
    let (model, _id_map) = mapper.to_domain(&doc).unwrap();

    let layers: Vec<_> = model
        .store
        .layers_with_ids()
        .map(|(id, l)| {
            (
                id,
                l.name.as_ref().map(|n| n.text.as_str()),
                l.visible,
                l.locked,
            )
        })
        .collect();

    let hidden_layer = layers
        .iter()
        .find(|(_, name, _, _)| *name == Some("Hidden Layer"))
        .unwrap();
    assert!(!hidden_layer.2, "Hidden Layer should not be visible");

    let locked_layer = layers
        .iter()
        .find(|(_, name, _, _)| *name == Some("Locked Layer"))
        .unwrap();
    assert!(locked_layer.3, "Locked Layer should be locked");

    let normal_layer = layers
        .iter()
        .find(|(_, name, _, _)| *name == Some("Normal Layer"))
        .unwrap();
    assert!(normal_layer.2, "Normal Layer should be visible (default)");
    assert!(
        !normal_layer.3,
        "Normal Layer should not be locked (default)"
    );
}
