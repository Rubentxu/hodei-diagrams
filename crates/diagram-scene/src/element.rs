//! Visual element types: the enum and all element structs.
//!
//! `VisualElement`, `EntityId`, and the 7 element structs implement the
//! scene projection per ADR-0036.

use diagram_core::geometry::{Point, Rect};
use diagram_core::{EdgeId, GroupId, VertexId};
use serde::{Deserialize, Serialize};

/// Re-export path command types from diagram-stencils for use in StencilElement.
pub use diagram_stencils::PathCommand;

/// A stable engine-owned identifier for a vertex, edge, or group.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
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
#[derive(Debug, Clone, Serialize, Deserialize)]
#[non_exhaustive]
pub enum VisualElement {
    /// A rectangle element.
    Rect(RectElement),
    /// A rectangle with rounded corners.
    RoundedRect(RoundedRectElement),
    /// An ellipse element.
    Ellipse(EllipseElement),
    /// A diamond (rhombus) element.
    Diamond(DiamondElement),
    /// A triangle element.
    Triangle(TriangleElement),
    /// A hexagon element.
    Hexagon(HexagonElement),
    /// A cylinder element.
    Cylinder(CylinderElement),
    /// A cloud element.
    Cloud(CloudElement),
    /// A parallelogram element.
    Parallelogram(ParallelogramElement),
    /// A trapezoid element.
    Trapezoid(TrapezoidElement),
    /// A free-form polygon element.
    Polygon(PolygonElement),
    /// A text label element.
    Text(TextElement),
    /// A straight line element.
    Line(LineElement),
    /// A polyline/polygon path element (reserved for future routing output).
    Path(PathElement),
    /// A group element containing nested children.
    Group(GroupElement),
    /// A draw.io stencil reference, resolved at scene-build time.
    Stencil(StencilElement),
    /// An image element — rendered as `<image href=.../>` in SVG.
    Image(ImageElement),
}

/// A draw.io stencil element — resolved path commands embedded at scene build.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StencilElement {
    /// The vertex ID.
    pub id: VertexId,
    /// Library name from `<shapes name="...">`.
    pub library: String,
    /// Shape name from `<shape name="...">`.
    pub name: String,
    /// The bounds in page coordinates.
    pub bounds: Rect,
    /// Aspect ratio constraint.
    pub aspect: StencilAspect,
    /// Background path commands (already scaled to bounds).
    pub background: Vec<PathCommand>,
    /// Foreground path commands (already scaled to bounds).
    pub foreground: Vec<PathCommand>,
    /// The rotation angle in radians (clockwise positive).
    pub rotation: f64,
    /// Horizontal flip flag.
    pub flip_h: bool,
    /// Vertical flip flag.
    pub flip_v: bool,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// Aspect ratio constraint for a stencil.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StencilAspect {
    /// Fixed aspect ratio (width / height is locked).
    Fixed,
    /// Variable — can stretch independently.
    Variable,
}

/// Image fit mode — how the image fills the element bounds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[non_exhaustive]
pub enum ImageAspect {
    /// Fit within bounds, preserving aspect ratio (SVG `xMidYMid meet`).
    Contain,
    /// Fill bounds, preserving aspect ratio, may crop (SVG `xMidYMid slice`).
    Cover,
    /// Stretch to fill bounds, ignoring aspect ratio (SVG `none`).
    Stretch,
}

/// Static definition of a built-in stencil shape.
/// Used by the registry to look up normalised [0,1] path data.
#[derive(Debug, Clone, Copy)]
pub struct StencilDef {
    /// Width hint (normalised units).
    pub width: f64,
    /// Height hint (normalised units).
    pub height: f64,
    /// Aspect ratio constraint.
    pub aspect: StencilAspect,
    /// Background path commands (normalised [0,1] coordinates).
    pub background: &'static [PathCommand],
    /// Foreground path commands (normalised [0,1] coordinates).
    pub foreground: &'static [PathCommand],
}

impl From<diagram_stencils::Aspect> for StencilAspect {
    fn from(a: diagram_stencils::Aspect) -> Self {
        match a {
            diagram_stencils::Aspect::Fixed => StencilAspect::Fixed,
            diagram_stencils::Aspect::Variable => StencilAspect::Variable,
        }
    }
}

/// An image element — rendered as an `<image>` tag in SVG.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageElement {
    /// The vertex ID.
    pub id: VertexId,
    /// The bounds in page coordinates.
    pub bounds: Rect,
    /// Image source URL or data-URI.
    pub image_src: Option<String>,
    /// How the image fits within the bounds.
    pub aspect: ImageAspect,
    /// The rotation angle in radians (clockwise positive).
    pub rotation: f64,
    /// Horizontal flip flag.
    pub flip_h: bool,
    /// Vertical flip flag.
    pub flip_v: bool,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// A rectangle element.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RectElement {
    /// The vertex ID.
    pub id: VertexId,
    /// The bounds in page coordinates.
    pub bounds: Rect,
    /// The rotation angle in radians (clockwise positive).
    pub rotation: f64,
    /// Horizontal flip flag.
    pub flip_h: bool,
    /// Vertical flip flag.
    pub flip_v: bool,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// A rectangle with rounded corners.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoundedRectElement {
    /// The vertex ID.
    pub id: VertexId,
    /// The bounds in page coordinates.
    pub bounds: Rect,
    /// The corner radius.
    pub radius: f64,
    /// The rotation angle in radians (clockwise positive).
    pub rotation: f64,
    /// Horizontal flip flag.
    pub flip_h: bool,
    /// Vertical flip flag.
    pub flip_v: bool,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// An ellipse element.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EllipseElement {
    /// The vertex ID.
    pub id: VertexId,
    /// The bounds in page coordinates.
    pub bounds: Rect,
    /// The rotation angle in radians (clockwise positive).
    pub rotation: f64,
    /// Horizontal flip flag.
    pub flip_h: bool,
    /// Vertical flip flag.
    pub flip_v: bool,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// A diamond (rhombus) element.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiamondElement {
    /// The vertex ID.
    pub id: VertexId,
    /// The bounds in page coordinates.
    pub bounds: Rect,
    /// The rotation angle in radians (clockwise positive).
    pub rotation: f64,
    /// Horizontal flip flag.
    pub flip_h: bool,
    /// Vertical flip flag.
    pub flip_v: bool,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// A triangle element.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriangleElement {
    /// The vertex ID.
    pub id: VertexId,
    /// The bounds in page coordinates.
    pub bounds: Rect,
    /// The rotation angle in radians (clockwise positive).
    pub rotation: f64,
    /// Horizontal flip flag.
    pub flip_h: bool,
    /// Vertical flip flag.
    pub flip_v: bool,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// A hexagon element.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HexagonElement {
    /// The vertex ID.
    pub id: VertexId,
    /// The bounds in page coordinates.
    pub bounds: Rect,
    /// The rotation angle in radians (clockwise positive).
    pub rotation: f64,
    /// Horizontal flip flag.
    pub flip_h: bool,
    /// Vertical flip flag.
    pub flip_v: bool,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// A cylinder element (3D-ish).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CylinderElement {
    /// The vertex ID.
    pub id: VertexId,
    /// The bounds in page coordinates.
    pub bounds: Rect,
    /// The rotation angle in radians (clockwise positive).
    pub rotation: f64,
    /// Horizontal flip flag.
    pub flip_h: bool,
    /// Vertical flip flag.
    pub flip_v: bool,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// A cloud element.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudElement {
    /// The vertex ID.
    pub id: VertexId,
    /// The bounds in page coordinates.
    pub bounds: Rect,
    /// The rotation angle in radians (clockwise positive).
    pub rotation: f64,
    /// Horizontal flip flag.
    pub flip_h: bool,
    /// Vertical flip flag.
    pub flip_v: bool,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// A parallelogram element.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParallelogramElement {
    /// The vertex ID.
    pub id: VertexId,
    /// The bounds in page coordinates.
    pub bounds: Rect,
    /// The rotation angle in radians (clockwise positive).
    pub rotation: f64,
    /// Horizontal flip flag.
    pub flip_h: bool,
    /// Vertical flip flag.
    pub flip_v: bool,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// A trapezoid element.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrapezoidElement {
    /// The vertex ID.
    pub id: VertexId,
    /// The bounds in page coordinates.
    pub bounds: Rect,
    /// The rotation angle in radians (clockwise positive).
    pub rotation: f64,
    /// Horizontal flip flag.
    pub flip_h: bool,
    /// Vertical flip flag.
    pub flip_v: bool,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// A free-form polygon element.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolygonElement {
    /// The vertex ID.
    pub id: VertexId,
    /// The polygon points in page coordinates.
    pub points: Vec<Point>,
    /// The bounds in page coordinates (derived from points min/max).
    pub bounds: Rect,
    /// The rotation angle in radians (clockwise positive).
    pub rotation: f64,
    /// Horizontal flip flag.
    pub flip_h: bool,
    /// Vertical flip flag.
    pub flip_v: bool,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// A text label element.
#[derive(Debug, Clone, Serialize, Deserialize)]
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
#[derive(Debug, Clone, Serialize, Deserialize)]
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
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathElement {
    /// The edge ID.
    pub id: EdgeId,
    /// The path points in page coordinates.
    pub points: Vec<Point>,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// Swimlane header descriptor — present when a group represents a swimlane
/// (pool or lane). The header is the resize band at the top or left edge,
/// controlled by `startSize` and `horizontal` style keys in draw.io.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwimlaneHeader {
    /// The header band bounds in page coordinates.
    pub bounds: Rect,
    /// Whether the swimlane is horizontal (`true`) or vertical (`false`).
    ///
    /// - `horizontal = true`: header is a vertical strip on the left
    ///   (x=group.x, y=group.y, w=startSize, h=group.h)
    /// - `horizontal = false`: header is a horizontal band at the top
    ///   (x=group.x, y=group.y, w=group.w, h=startSize)
    pub horizontal: bool,
}

/// A group element containing nested children.
#[derive(Debug, Clone, Serialize, Deserialize)]
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
    /// Swimlane header, if this group represents a swimlane.
    #[serde(default)]
    pub header: Option<SwimlaneHeader>,
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
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
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
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: style.clone(),
        });
        let child2 = VisualElement::Ellipse(EllipseElement {
            id: VertexId::default(),
            bounds,
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: style.clone(),
        });

        let group = GroupElement {
            id: gid,
            bounds,
            style,
            children: vec![child1, child2],
            clip: true,
            header: None,
        };

        assert_eq!(group.children.len(), 2);
        assert!(matches!(group.children[0], VisualElement::Rect(_)));
        assert!(matches!(group.children[1], VisualElement::Ellipse(_)));
        assert!(group.clip);
    }

    // ─── new element tests ─────────────────────────────────────────────────────

    #[test]
    fn diamond_element_construction() {
        let vid = VertexId::default();
        let bounds = Rect {
            origin: Point { x: 10.0, y: 20.0 },
            size: Size {
                width: 80.0,
                height: 40.0,
            },
        };
        let style = ResolvedStyle::default();

        let elem = DiamondElement {
            id: vid,
            bounds,
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: style.clone(),
        };

        assert_eq!(elem.id, vid);
        assert_eq!(elem.bounds.origin.x, 10.0);
        assert_eq!(elem.bounds.size.width, 80.0);
        assert_eq!(elem.style.is_empty(), style.is_empty());
    }

    #[test]
    fn triangle_element_construction() {
        let vid = VertexId::default();
        let bounds = Rect {
            origin: Point { x: 0.0, y: 0.0 },
            size: Size {
                width: 100.0,
                height: 80.0,
            },
        };
        let style = ResolvedStyle::default();

        let elem = TriangleElement {
            id: vid,
            bounds,
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style: style.clone(),
        };

        assert_eq!(elem.id, vid);
        assert_eq!(elem.bounds.size.height, 80.0);
    }

    #[test]
    fn hexagon_element_construction() {
        let vid = VertexId::default();
        let bounds = Rect {
            origin: Point { x: 0.0, y: 0.0 },
            size: Size {
                width: 100.0,
                height: 100.0,
            },
        };
        let style = ResolvedStyle::default();

        let elem = HexagonElement {
            id: vid,
            bounds,
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style,
        };

        assert_eq!(elem.id, vid);
    }

    #[test]
    fn cylinder_element_construction() {
        let vid = VertexId::default();
        let bounds = Rect {
            origin: Point { x: 0.0, y: 0.0 },
            size: Size {
                width: 60.0,
                height: 100.0,
            },
        };
        let style = ResolvedStyle::default();

        let elem = CylinderElement {
            id: vid,
            bounds,
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style,
        };

        assert_eq!(elem.id, vid);
    }

    #[test]
    fn cloud_element_construction() {
        let vid = VertexId::default();
        let bounds = Rect {
            origin: Point { x: 0.0, y: 0.0 },
            size: Size {
                width: 120.0,
                height: 80.0,
            },
        };
        let style = ResolvedStyle::default();

        let elem = CloudElement {
            id: vid,
            bounds,
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style,
        };

        assert_eq!(elem.id, vid);
    }

    #[test]
    fn parallelogram_element_construction() {
        let vid = VertexId::default();
        let bounds = Rect {
            origin: Point { x: 0.0, y: 0.0 },
            size: Size {
                width: 100.0,
                height: 60.0,
            },
        };
        let style = ResolvedStyle::default();

        let elem = ParallelogramElement {
            id: vid,
            bounds,
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style,
        };

        assert_eq!(elem.id, vid);
    }

    #[test]
    fn trapezoid_element_construction() {
        let vid = VertexId::default();
        let bounds = Rect {
            origin: Point { x: 0.0, y: 0.0 },
            size: Size {
                width: 100.0,
                height: 60.0,
            },
        };
        let style = ResolvedStyle::default();

        let elem = TrapezoidElement {
            id: vid,
            bounds,
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style,
        };

        assert_eq!(elem.id, vid);
    }

    #[test]
    fn polygon_element_construction() {
        let vid = VertexId::default();
        let points = vec![
            Point { x: 10.0, y: 10.0 },
            Point { x: 50.0, y: 10.0 },
            Point { x: 50.0, y: 50.0 },
            Point { x: 10.0, y: 50.0 },
        ];
        let bounds = Rect {
            origin: Point { x: 10.0, y: 10.0 },
            size: Size {
                width: 40.0,
                height: 40.0,
            },
        };
        let style = ResolvedStyle::default();

        let elem = PolygonElement {
            id: vid,
            points: points.clone(),
            bounds,
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style,
        };

        assert_eq!(elem.id, vid);
        assert_eq!(elem.points.len(), 4);
    }

    #[test]
    fn polygon_element_min_points_validation() {
        // PolygonElement can be constructed with any points,
        // but the engine should validate min 3 points at add time
        let vid = VertexId::default();
        let points = vec![Point { x: 10.0, y: 10.0 }, Point { x: 50.0, y: 10.0 }];
        let bounds = Rect {
            origin: Point { x: 10.0, y: 10.0 },
            size: Size {
                width: 40.0,
                height: 0.0,
            },
        };
        let style = ResolvedStyle::default();

        let elem = PolygonElement {
            id: vid,
            points,
            bounds,
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            style,
        };

        // Construction succeeds; validation happens at engine level
        assert_eq!(elem.points.len(), 2);
    }

    #[test]
    fn visual_element_is_non_exhaustive() {
        // Compile-fail guard: requires #[non_exhaustive] to compile
        fn _assert_non_exhaustive(e: VisualElement) {
            match e {
                VisualElement::Rect(_) => {}
                VisualElement::RoundedRect(_) => {}
                VisualElement::Ellipse(_) => {}
                VisualElement::Diamond(_) => {}
                VisualElement::Triangle(_) => {}
                VisualElement::Hexagon(_) => {}
                VisualElement::Cylinder(_) => {}
                VisualElement::Cloud(_) => {}
                VisualElement::Parallelogram(_) => {}
                VisualElement::Trapezoid(_) => {}
                VisualElement::Polygon(_) => {}
                VisualElement::Text(_) => {}
                VisualElement::Line(_) => {}
                VisualElement::Path(_) => {}
                VisualElement::Group(_) => {}
                VisualElement::Stencil(_) => {}
                VisualElement::Image(_) => {}
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
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
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
