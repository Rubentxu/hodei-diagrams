//! Visual element types: the enum and all element structs.
//!
//! `VisualElement`, `EntityId`, and the 7 element structs are implemented in
//! PR2. This stub exists to keep the workspace compiling during the skeleton PR.

/// A stable engine-owned identifier for a vertex, edge, or group.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub enum EntityId {
    /// Identifies a vertex.
    Vertex(diagram_core::VertexId),
    /// Identifies an edge.
    Edge(diagram_core::EdgeId),
    /// Identifies a group.
    Group(diagram_core::GroupId),
}

/// The visual element kinds projected from a diagram model.
///
/// Each variant carries typed engine IDs and resolved styles, ready for any
/// render backend to consume.
#[derive(Debug, Clone)]
#[non_exhaustive]
pub enum VisualElement {
    // Variants are implemented in PR2.
}

/// RectElement — implemented in PR2.
#[derive(Debug, Clone)]
pub struct RectElement {
    /// The vertex ID.
    pub id: diagram_core::VertexId,
    /// The bounds in page coordinates.
    pub bounds: diagram_core::CellGeometry,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// RoundedRectElement — implemented in PR2.
#[derive(Debug, Clone)]
pub struct RoundedRectElement {
    /// The vertex ID.
    pub id: diagram_core::VertexId,
    /// The bounds in page coordinates.
    pub bounds: diagram_core::CellGeometry,
    /// The corner radius.
    pub radius: f64,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// EllipseElement — implemented in PR2.
#[derive(Debug, Clone)]
pub struct EllipseElement {
    /// The vertex ID.
    pub id: diagram_core::VertexId,
    /// The bounds in page coordinates.
    pub bounds: diagram_core::CellGeometry,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// TextElement — implemented in PR2.
#[derive(Debug, Clone)]
pub struct TextElement {
    /// The entity that owns this text.
    pub owner: EntityId,
    /// The text anchor point in page coordinates.
    pub anchor: diagram_core::CellGeometry,
    /// The text content.
    pub text: String,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// LineElement — implemented in PR2.
#[derive(Debug, Clone)]
pub struct LineElement {
    /// The edge ID.
    pub id: diagram_core::EdgeId,
    /// The line start point in page coordinates.
    pub from: diagram_core::CellGeometry,
    /// The line end point in page coordinates.
    pub to: diagram_core::CellGeometry,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// PathElement — implemented in PR2.
#[derive(Debug, Clone)]
pub struct PathElement {
    /// The edge ID.
    pub id: diagram_core::EdgeId,
    /// The path points in page coordinates.
    pub points: Vec<diagram_core::CellGeometry>,
    /// The resolved style.
    pub style: super::ResolvedStyle,
}

/// GroupElement — implemented in PR2.
#[derive(Debug, Clone)]
pub struct GroupElement {
    /// The group ID.
    pub id: diagram_core::GroupId,
    /// The group bounds in page coordinates.
    pub bounds: diagram_core::CellGeometry,
    /// The resolved style.
    pub style: super::ResolvedStyle,
    /// The nested children.
    pub children: Vec<VisualElement>,
    /// Whether children are clipped to the group bounds.
    pub clip: bool,
}
