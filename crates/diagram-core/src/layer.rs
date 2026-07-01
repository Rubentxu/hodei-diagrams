//! Layer payload for the diagram engine.
//!
//! A layer is a named group of shapes within a page. Every page has exactly
//! one default (unnamed) layer. Shapes with `layer_id: None` belong to the
//! default layer. Layers are orthogonal to groups: `layer_id` determines
//! which layer a shape belongs to, while `parent` (on Vertex/Edge) determines
//! which group within that layer.

use crate::id::{LayerId, PageId};
use crate::label::Label;
use serde::{Deserialize, Serialize};

/// A layer within a page.
///
/// Layers provide named groupings of shapes. Every page has exactly one
/// default layer (with `name: None`) that shapes belong to when they have
/// `layer_id: None`. Named layers are user-created and can be shown/hidden
/// and locked/unlocked independently.
///
/// See ADR-0081 §Layer model.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Layer {
    /// Engine-owned identifier for this layer.
    pub id: LayerId,
    /// The page this layer belongs to.
    pub page_id: PageId,
    /// Optional user-facing name. `None` means the default (unnamed) layer.
    /// Default layers cannot be renamed or deleted.
    pub name: Option<Label>,
    /// Whether this layer is visible. Invisible layers are excluded from the
    /// scene display list. Default is true.
    pub visible: bool,
    /// Whether this layer is locked. The engine stores this flag but does NOT
    /// enforce it — the editor layer is responsible for preventing mutations
    /// on locked shapes. Default is false.
    pub locked: bool,
}

impl Default for Layer {
    fn default() -> Self {
        Self {
            id: Default::default(),
            page_id: Default::default(),
            name: None,
            visible: true,
            locked: false,
        }
    }
}

impl Layer {
    /// Create a layer with the given engine ID and page ID.
    pub fn new(id: LayerId, page_id: PageId) -> Self {
        Self {
            id,
            page_id,
            name: None,
            visible: true,
            locked: false,
        }
    }

    /// Returns `true` if this is the default (unnamed) layer for its page.
    pub fn is_default(&self) -> bool {
        self.name.is_none()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_layer_has_no_name() {
        let layer = Layer::default();
        assert!(layer.name.is_none());
    }

    #[test]
    fn default_layer_is_visible() {
        let layer = Layer::default();
        assert!(layer.visible);
    }

    #[test]
    fn default_layer_is_not_locked() {
        let layer = Layer::default();
        assert!(!layer.locked);
    }

    #[test]
    fn is_default_returns_true_for_unnamed_layer() {
        let layer = Layer::default();
        assert!(layer.is_default());
    }

    #[test]
    fn is_default_returns_false_for_named_layer() {
        let layer = Layer {
            name: Some(Label::new("My Layer")),
            ..Default::default()
        };
        assert!(!layer.is_default());
    }

    #[test]
    fn layer_new_sets_id_and_page_id() {
        let layer_id = LayerId::default();
        let page_id = PageId::default();
        let layer = Layer::new(layer_id, page_id);
        assert_eq!(layer.id, layer_id);
        assert_eq!(layer.page_id, page_id);
    }

    #[test]
    fn layer_serde_roundtrip() {
        let layer = Layer {
            id: LayerId::default(),
            page_id: PageId::default(),
            name: Some(Label::new("Test Layer")),
            visible: true,
            locked: false,
        };
        let json = serde_json::to_string(&layer).unwrap();
        let parsed: Layer = serde_json::from_str(&json).unwrap();
        assert_eq!(layer, parsed);
    }

    #[test]
    fn default_layer_serde_roundtrip() {
        let layer = Layer::default();
        let json = serde_json::to_string(&layer).unwrap();
        let parsed: Layer = serde_json::from_str(&json).unwrap();
        assert_eq!(layer, parsed);
    }
}
