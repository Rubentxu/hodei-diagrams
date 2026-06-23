//! Thin WASM bridge for diagram metadata.
//!
//! No business logic — pure JSON↔struct adapter crossing the WASM boundary.

use crate::engine::with_engine;
use crate::engine::with_engine_mut;
use diagram_core::Metadata;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// DTO crossing the WASM boundary. Field names are snake_case in JSON
/// (matches the TypeScript `MetadataInfo` interface).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataDto {
    pub title: Option<String>,
    pub author: Option<String>,
    pub description: Option<String>,
    pub tags: Vec<String>,
    /// RFC-3339 / ISO-8601 string. JS-side parses with `new Date(s)`.
    pub created: String,
    pub modified: String,
}

impl From<&Metadata> for MetadataDto {
    fn from(m: &Metadata) -> Self {
        Self {
            title: m.title.clone(),
            author: m.author.clone(),
            description: m.description.clone(),
            tags: m.tags.clone(),
            created: m.created.to_rfc3339(),
            modified: m.modified.to_rfc3339(),
        }
    }
}

impl From<MetadataDto> for Metadata {
    fn from(dto: MetadataDto) -> Self {
        Self {
            title: dto.title,
            author: dto.author,
            description: dto.description,
            tags: dto.tags,
            created: parse_iso(&dto.created),
            modified: parse_iso(&dto.modified),
        }
    }
}

fn parse_iso(s: &str) -> chrono::DateTime<chrono::Utc> {
    chrono::DateTime::parse_from_rfc3339(s)
        .map(|d| d.with_timezone(&chrono::Utc))
        .unwrap_or_else(|_| chrono::DateTime::from_timestamp(0, 0).unwrap())
}

/// Returns the current engine metadata as a JSON string.
///
/// When no metadata is set, returns the JSON literal `"null"`.
#[wasm_bindgen]
pub fn get_metadata(handle: u32) -> Result<String, JsValue> {
    with_engine(handle, |engine| {
        engine
            .editor
            .model()
            .metadata()
            .map(|m| {
                let dto = MetadataDto::from(m);
                serde_json::to_string(&dto).unwrap()
            })
            .unwrap_or_else(|| "null".to_string())
    })
    .map_err(JsValue::from_str)
}

/// Applies a JSON metadata DTO to the engine. Stamps `modified` to `Utc::now()`
/// and sets `created` if still at the default epoch.
///
/// Returns `Err(JsValue)` with `MetadataError:` prefix on invalid input.
#[wasm_bindgen]
pub fn set_metadata(handle: u32, json: &str) -> Result<(), JsValue> {
    let dto: MetadataDto = serde_json::from_str(json)
        .map_err(|e| JsValue::from_str(&format!("MetadataError: {}", e)))?;

    with_engine_mut(handle, |engine| {
        let mut metadata = Metadata::from(dto);
        let now = chrono::Utc::now();
        metadata.touch_modified(now);
        engine.editor.set_metadata(metadata);
    })
    .map_err(JsValue::from_str)
}
