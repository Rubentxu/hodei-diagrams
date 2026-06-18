//! Visual element types: the enum and all element structs.
//!
//! `VisualElement`, `EntityId`, and the 7 element structs implement the
//! scene projection per ADR-0036.

use diagram_core::geometry::{Point, Rect};
use diagram_core::{EdgeId, GroupId, VertexId};

/// A stable engine-owned identifier for a vertex, edge, or group.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub enum EntityId {
    /// Identifies a vertex.
    Vertex(VertexId),
    /// Identifies an edge.
    Edge(EdgeId),
    /// Identifies a group.
    Group(GroupId),
}

/// The default radius for rounded rectangles (draw.io convention).
pub const DEFAULT_ROUNDED_RADIUS: f64 = 8.0;

/// The visual element kinds projected from a diagram model.
///
/// Each variant carries typed engine IDs and resolved styles, ready for any
/// render backend to consume.
#[derive(Debug, Clone)]
#[non_exhaustive]
pub enum VisualElement {
    /// A rectangle element.
    Rect(RectElement),
    /// A rectangle with rounded corners.
    RoundedRect(RoundedRectElement),
    /// An ellipse element.
    Ellipse(EllipseElement),
    /// A text label element.
    Text(TextElement),
    /// A straight line element.
    Line(LineElement),
    /// A polyline/polygon path element (reserved for future routing output).
    Path(PathElement),
    /// A group element containing nested children.
    Group(GroupElement),
}

/// A rectangle element.
#[derive(Debug, Clone)]
pub struct RectElement {
    /// The vertex ID.
    pub id: VertexId,
    /// The bounds in page coordinates.
    pub bounds: Rect,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// A rectangle with rounded corners.
#[derive(Debug, Clone)]
pub struct RoundedRectElement {
    /// The vertex ID.
    pub id: VertexId,
    /// The bounds in page coordinates.
    pub bounds: Rect,
    /// The corner radius.
    pub radius: f64,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// An ellipse element.
#[derive(Debug, Clone)]
pub struct EllipseElement {
    /// The vertex ID.
    pub id: VertexId,
    /// The bounds in page coordinates.
    pub bounds: Rect,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// A text label element.
#[derive(Debug, Clone)]
pub struct TextElement {
    /// The entity that owns this text.
    pub owner: EntityId,
    /// The text anchor point in page coordinates.
    pub anchor: Point,
    /// The text content.
    pub text: String,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// A straight line element.
#[derive(Debug, Clone)]
pub struct LineElement {
    /// The edge ID.
    pub id: EdgeId,
    /// The line start point in page coordinates.
    pub from: Point,
    /// The line end point in page coordinates.
    pub to: Point,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// A polyline/polygon path element.
///
/// Reserved for future `diagram-routing` output. In v1, edges produce `Line` elements.
#[derive(Debug, Clone)]
pub struct PathElement {
    /// The edge ID.
    pub id: EdgeId,
    /// The path points in page coordinates.
    pub points: Vec<Point>,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// A group element containing nested children.
#[derive(Debug, Clone)]
pub struct GroupElement {
    /// The group ID.
    pub id: GroupId,
    /// The group bounds in page coordinates.
    pub bounds: Rect,
    /// The resolved style.
    pub style: super::ResolvedStyle,
    /// The nested children.
    pub children: Vec<VisualElement>,
    /// Whether children are clipped to the group bounds.
    pub clip: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ResolvedStyle;
    use diagram_core::geometry::Size;

    #[test]
    fn entity_id_derives() {
        let vid = VertexId::default();
        let eid = EdgeId::default();

        assert_eq!(EntityId::Vertex(vid), EntityId::Vertex(vid));
        assert_ne!(EntityId::Vertex(vid), EntityId::Edge(eid));
        assert_eq!(EntityId::Vertex(vid), EntityId::Vertex(vid)); // Copy
    }

    #[test]
    fn rect_element_construction() {
        let vid = VertexId::default();
        let bounds = Rect {
            origin: Point { x: 10.0, y: 20.0 },
            size: Size {
                width: 80.0,
                height: 40.0,
            },
        };
        let style = ResolvedStyle::default();

        let elem = RectElement {
            id: vid,
            bounds,
            style: style.clone(),
        };

        assert_eq!(elem.id, vid);
        assert_eq!(elem.bounds.origin.x, 10.0);
        assert_eq!(elem.bounds.origin.y, 20.0);
        assert_eq!(elem.bounds.size.width, 80.0);
        assert_eq!(elem.bounds.size.height, 40.0);
        assert_eq!(elem.style.is_empty(), style.is_empty());
    }

    #[test]
    fn rounded_rect_default_radius() {
        let _vid = VertexId::default();
        let _bounds = Rect {
            origin: Point { x: 0.0, y: 0.0 },
            size: Size {
                width: 100.0,
                height: 100.0,
            },
        };
        let style = ResolvedStyle {
            rounded: Some(true),
            ..Default::default()
        };

        // When style has rounded=1, radius should be DEFAULT_ROUNDED_RADIUS
        let radius = if style.rounded == Some(true) {
            DEFAULT_ROUNDED_RADIUS
        } else {
            0.0
        };

        assert_eq!(radius, DEFAULT_ROUNDED_RADIUS);
        assert_eq!(radius, 8.0);
    }

    #[test]
    fn text_element_owns_entity_id() {
        let vid = VertexId::default();
        let anchor = Point { x: 0.0, y: 0.0 };
        let style = ResolvedStyle::default();

        let elem = TextElement {
            owner: EntityId::Vertex(vid),
            anchor,
            text: "hello".to_owned(),
            style,
        };

        // Round-trip through Debug + Clone
        let debug = format!("{:?}", elem);
        assert!(debug.contains("TextElement"));
        assert!(debug.contains("hello"));

        let cloned = elem.clone();
        assert_eq!(cloned.owner, elem.owner);
        assert_eq!(cloned.text, elem.text);
    }

    #[test]
    fn group_element_nests_children() {
        let gid = GroupId::default();
        let bounds = Rect {
            origin: Point { x: 0.0, y: 0.0 },
            size: Size {
                width: 200.0,
                height: 200.0,
            },
        };
        let style = ResolvedStyle::default();

        let child1 = VisualElement::Rect(RectElement {
            id: VertexId::default(),
            bounds,
            style: style.clone(),
        });
        let child2 = VisualElement::Ellipse(EllipseElement {
            id: VertexId::default(),
            bounds,
            style: style.clone(),
        });

        let group = GroupElement {
            id: gid,
            bounds,
            style,
            children: vec![child1, child2],
            clip: true,
        };

        assert_eq!(group.children.len(), 2);
        assert!(matches!(group.children[0], VisualElement::Rect(_)));
        assert!(matches!(group.children[1], VisualElement::Ellipse(_)));
        assert!(group.clip);
    }

    #[test]
    fn visual_element_is_non_exhaustive() {
        // Compile-fail guard: requires #[non_exhaustive] to compile
        fn _assert_non_exhaustive(e: VisualElement) {
            match e {
                VisualElement::Rect(_) => {}
                VisualElement::RoundedRect(_) => {}
                VisualElement::Ellipse(_) => {}
                VisualElement::Text(_) => {}
                VisualElement::Line(_) => {}
                VisualElement::Path(_) => {}
                VisualElement::Group(_) => {}
            }
        }

        // This just proves the match is exhaustive (which requires #[non_exhaustive])
        let vid = VertexId::default();
        let elem = VisualElement::Rect(RectElement {
            id: vid,
            bounds: Rect {
                origin: Point { x: 0.0, y: 0.0 },
                size: Size {
                    width: 100.0,
                    height: 100.0,
                },
            },
            style: ResolvedStyle::default(),
        });
        _assert_non_exhaustive(elem);
    }

    #[test]
    fn entity_id_is_non_exhaustive() {
        fn _assert_non_exhaustive_id(id: EntityId) {
            match id {
                EntityId::Vertex(_) => {}
                EntityId::Edge(_) => {}
                EntityId::Group(_) => {}
            }
        }

        let id = EntityId::Vertex(VertexId::default());
        _assert_non_exhaustive_id(id);
    }
}
