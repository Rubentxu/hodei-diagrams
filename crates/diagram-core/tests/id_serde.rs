//! Tests for the JSON shape of slotmap-backed IDs.
//!
//! The TS editor sends slotmap IDs as `{ idx, version }` objects, so the
//! Rust types must serialize to the same shape — otherwise every
//! command that includes a target cell ID will fail to deserialize
//! and surface an "unknown variant" error in the UI.

use diagram_core::{EdgeId, GroupId, PageId, StableIdExt, StyleId, VertexId};

#[test]
fn vertex_id_serializes_as_idx_version_object() {
    let id = VertexId::default();
    let json = serde_json::to_value(id).expect("serialize VertexId");
    let obj = json
        .as_object()
        .expect("VertexId should serialize as a JSON object");
    assert!(
        obj.contains_key("idx"),
        "VertexId JSON should have an `idx` key, got {obj:?}"
    );
    assert!(
        obj.contains_key("version"),
        "VertexId JSON should have a `version` key, got {obj:?}"
    );
}

#[test]
fn edge_id_serializes_as_idx_version_object() {
    let id = EdgeId::default();
    let json = serde_json::to_value(id).expect("serialize EdgeId");
    let obj = json
        .as_object()
        .expect("EdgeId should serialize as a JSON object");
    assert!(
        obj.contains_key("idx"),
        "EdgeId JSON should have an `idx` key"
    );
    assert!(
        obj.contains_key("version"),
        "EdgeId JSON should have a `version` key"
    );
}

#[test]
fn page_id_serializes_as_idx_version_object() {
    let id = PageId::default();
    let json = serde_json::to_value(id).expect("serialize PageId");
    let obj = json
        .as_object()
        .expect("PageId should serialize as a JSON object");
    assert!(
        obj.contains_key("idx"),
        "PageId JSON should have an `idx` key"
    );
    assert!(
        obj.contains_key("version"),
        "PageId JSON should have a `version` key"
    );
}

#[test]
fn group_id_serializes_as_idx_version_object() {
    let id = GroupId::default();
    let json = serde_json::to_value(id).expect("serialize GroupId");
    let obj = json
        .as_object()
        .expect("GroupId should serialize as a JSON object");
    assert!(
        obj.contains_key("idx"),
        "GroupId JSON should have an `idx` key"
    );
    assert!(
        obj.contains_key("version"),
        "GroupId JSON should have a `version` key"
    );
}

#[test]
fn style_id_serializes_as_idx_version_object() {
    let id = StyleId::default();
    let json = serde_json::to_value(id).expect("serialize StyleId");
    let obj = json
        .as_object()
        .expect("StyleId should serialize as a JSON object");
    assert!(
        obj.contains_key("idx"),
        "StyleId JSON should have an `idx` key"
    );
    assert!(
        obj.contains_key("version"),
        "StyleId JSON should have a `version` key"
    );
}

#[test]
fn roundtrip_preserves_value() {
    use diagram_core::ModelStore;
    let mut store = ModelStore::new();
    store.insert_page(diagram_core::Page::default());
    let pid = store.pages_with_ids().next().unwrap().0;
    let json = serde_json::to_value(pid).unwrap();
    let back: PageId = serde_json::from_value(json).expect("roundtrip PageId");
    assert_eq!(
        pid, back,
        "PageId should roundtrip through {{idx, version}} JSON"
    );
}

/// `StableIdExt::stable_id_parts` is the FFI-safe accessor that lets the
/// SVG backend skip JSON serialization on a rendering hot path. Its
/// output must match what `serde_json::to_value` would produce for
/// `idx` and `version` — otherwise `data-vertex-id="idx:version"`
/// attributes would silently drift from the canonical JSON form.
#[test]
fn stable_id_parts_match_json_for_default_vertex_id() {
    let id = VertexId::default();
    let (idx, version) = id.stable_id_parts();
    let json = serde_json::to_value(id).expect("serialize VertexId");
    assert_eq!(
        idx,
        json["idx"].as_u64().expect("idx should be u64") as u32,
        "stable_id_parts idx should match JSON idx"
    );
    assert_eq!(
        version,
        json["version"].as_u64().expect("version should be u64") as u32,
        "stable_id_parts version should match JSON version"
    );
}

#[test]
fn stable_id_parts_match_json_for_default_edge_id() {
    let id = EdgeId::default();
    let (idx, version) = id.stable_id_parts();
    let json = serde_json::to_value(id).expect("serialize EdgeId");
    assert_eq!(idx, json["idx"].as_u64().unwrap() as u32);
    assert_eq!(version, json["version"].as_u64().unwrap() as u32);
}

#[test]
fn stable_id_parts_match_json_for_real_page_id() {
    use diagram_core::ModelStore;
    let mut store = ModelStore::new();
    store.insert_page(diagram_core::Page::default());
    let pid = store.pages_with_ids().next().unwrap().0;
    let (idx, version) = pid.stable_id_parts();
    let json = serde_json::to_value(pid).expect("serialize PageId");
    assert_eq!(idx, json["idx"].as_u64().unwrap() as u32);
    assert_eq!(version, json["version"].as_u64().unwrap() as u32);
}
