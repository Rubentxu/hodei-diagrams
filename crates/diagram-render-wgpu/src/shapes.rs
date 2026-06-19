//! Shape constants, hex color parsing, and inline WGSL shaders.
//!
//! The single instanced pipeline uses one vertex shader (unit quad → page space
//! → NDC) and one fragment shader that dispatches to SDF functions by
//! `shape_type`:

// ─── Shape kind constants ────────────────────────────────────────────────

/// Rectangular shape — no corner rounding.
pub const SHAPE_RECT: u32 = 0;
/// Rectangular shape with rounded corners.
pub const SHAPE_ROUNDED: u32 = 1;
/// Elliptical shape, inscribed in the bounding box.
pub const SHAPE_ELLIPSE: u32 = 2;
/// Line segment rendered as an oriented thin quad.
pub const SHAPE_LINE: u32 = 3;

// ─── Hex color parser ────────────────────────────────────────────────────

/// Parse a hex color string into `[r, g, b, a]` float components in `[0, 1]`.
///
/// Supports `#rgb`, `#rrggbb`, and `#rrggbbaa` formats.
/// Returns opaque black `[0.0, 0.0, 0.0, 1.0]` on invalid input.
pub fn parse_hex_color(hex: &str) -> [f32; 4] {
    let hex = hex.trim_start_matches('#');
    if hex.len() != 3 && hex.len() != 6 && hex.len() != 8 {
        return [0.0, 0.0, 0.0, 1.0];
    }
    let parse_component = |start: usize, len: usize| -> Option<f32> {
        let s = &hex[start..start + len];
        u8::from_str_radix(s, 16).ok().map(|v| v as f32 / 255.0)
    };
    match hex.len() {
        3 => {
            let r = parse_component(0, 1).map(|v| v * 17.0); // 0xF → 255
            let g = parse_component(1, 1).map(|v| v * 17.0);
            let b = parse_component(2, 1).map(|v| v * 17.0);
            match (r, g, b) {
                (Some(r), Some(g), Some(b)) => [r, g, b, 1.0],
                _ => [0.0, 0.0, 0.0, 1.0],
            }
        }
        6 => {
            let r = parse_component(0, 2);
            let g = parse_component(2, 2);
            let b = parse_component(4, 2);
            match (r, g, b) {
                (Some(r), Some(g), Some(b)) => [r, g, b, 1.0],
                _ => [0.0, 0.0, 0.0, 1.0],
            }
        }
        8 => {
            let r = parse_component(0, 2);
            let g = parse_component(2, 2);
            let b = parse_component(4, 2);
            let a = parse_component(6, 2);
            match (r, g, b, a) {
                (Some(r), Some(g), Some(b), Some(a)) => [r, g, b, a],
                _ => [0.0, 0.0, 0.0, 1.0],
            }
        }
        _ => [0.0, 0.0, 0.0, 1.0],
    }
}

// ─── Inline WGSL shader ──────────────────────────────────────────────────

/// The complete WGSL shader source for the shape pipeline.
///
/// ## Vertex stage
/// Accepts a unit-quad corner (`position` in `[0,1]×[0,1]`) and per-instance
/// attributes. For non-line shapes, maps the unit quad to page-coordinate space
/// via `bounds`. For `SHAPE_LINE`, computes an oriented thin quad from the
/// line endpoints encoded in `bounds.xy` (from) and `bounds.zw` (offset to).
/// Applies a top-left-origin NDC transform (y-down).
///
/// ## Fragment stage
/// Computes an analytic SDF based on `shape_type`:
/// - `SHAPE_RECT`: axis-aligned box SDF
/// - `SHAPE_ROUNDED`: Inigo Quilez rounded-box SDF
/// - `SHAPE_ELLIPSE`: normalized ellipse SDF
/// - `SHAPE_LINE`: segment distance SDF
/// Applies anti-aliasing via `smoothstep` and composites fill + stroke.
pub const SHAPE_WGSL: &str = r##"
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) bounds: vec4<f32>,
    @location(2) color: vec4<f32>,
    @location(3) stroke_color: vec4<f32>,
    @location(4) corner_radius: f32,
    @location(5) stroke_width: f32,
    @location(6) shape_type: u32,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) local_coord: vec2<f32>,
    @location(1) frag_color: vec4<f32>,
    @location(2) frag_stroke_color: vec4<f32>,
    @location(3) frag_corner_radius: f32,
    @location(4) frag_stroke_width: f32,
    @location(5) frag_shape_type: u32,
    @location(6) frag_line_from: vec2<f32>,
    @location(7) frag_line_to: vec2<f32>,
};

@group(0) @binding(0) var<uniform> viewport: vec2<f32>;

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var world_pos: vec2<f32>;
    var line_from: vec2<f32> = vec2<f32>(0.0, 0.0);
    var line_to: vec2<f32> = vec2<f32>(0.0, 0.0);

    if (input.shape_type == 3u) {
        // SHAPE_LINE: oriented thin quad from endpoints
        let from = input.bounds.xy;
        let to = from + input.bounds.zw;
        let dir = normalize(input.bounds.zw);
        let perp = vec2(-dir.y, dir.x);
        let half_stroke = input.stroke_width * 0.5;
        let along = from + input.position.x * input.bounds.zw;
        let offset = (input.position.y - 0.5) * perp * input.stroke_width;
        world_pos = along + offset;
        line_from = from;
        line_to = to;
    } else {
        world_pos = input.bounds.xy + input.position * input.bounds.zw;
    }

    // Top-left origin NDC: y-down
    var clip = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    clip.x = 2.0 * world_pos.x / viewport.x - 1.0;
    clip.y = 1.0 - 2.0 * world_pos.y / viewport.y;

    return VertexOutput(
        clip,
        input.position,
        input.color,
        input.stroke_color,
        input.corner_radius,
        input.stroke_width,
        input.shape_type,
        line_from,
        line_to,
    );
}

// ─── SDF helpers ─────────────────────────────────────────────────────────

fn sdRect(p: vec2<f32>, half: vec2<f32>) -> f32 {
    let d = abs(p) - half;
    return max(d.x, d.y);
}

fn sdRoundedBox(p: vec2<f32>, half: vec2<f32>, r: f32) -> f32 {
    let radius = min(r, min(half.x, half.y));
    let q = abs(p) - half + vec2<f32>(radius, radius);
    return min(max(q.x, q.y), 0.0) + length(max(q, vec2<f32>(0.0))) - radius;
}

fn sdEllipse(p: vec2<f32>, half: vec2<f32>) -> f32 {
    let q = p / half;
    return length(q) - 1.0;
}

fn sdLineSegment(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
    let ab = b - a;
    let ap = p - a;
    let t = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0);
    return length(ap - t * ab);
}

fn compute_sdf(p: vec2<f32>, shape_type: u32, half: vec2<f32>, radius: f32) -> f32 {
    switch (shape_type) {
        case 0u: { return sdRect(p, half); }
        case 1u: { return sdRoundedBox(p, half, radius); }
        case 2u: { return sdEllipse(p, half); }
        default: { return 1.0; }
    }
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let half = vec2<f32>(0.5, 0.5); // local coords are [0,1], so center is at 0.5

    var sdf: f32;
    if (input.frag_shape_type == 3u) {
        // Line segment SDF
        let p = input.frag_line_from + input.local_coord.x * (input.frag_line_to - input.frag_line_from);
        sdf = sdLineSegment(p, input.frag_line_from, input.frag_line_to);
    } else {
        // Shape SDF in local coords [0,1], shift center to origin
        let p = input.local_coord - vec2<f32>(0.5, 0.5);
        sdf = compute_sdf(p, input.frag_shape_type, half, input.frag_corner_radius);
    }

    // Anti-alias edge with fwidth-based smoothstep
    let aa_width = fwidth(sdf);
    let alpha = 1.0 - smoothstep(-aa_width, aa_width, sdf);

    if (alpha < 0.001) {
        discard;
    }

    // Fill color
    let fill = input.frag_color;

    // Stroke
    if (input.frag_stroke_width > 0.0 && input.frag_stroke_color.a > 0.001) {
        let half_stroke = input.frag_stroke_width * 0.5;
        let inner = sdf + half_stroke;
        let outer = sdf - half_stroke;
        let stroke_alpha = smoothstep(-aa_width, aa_width, -inner) * smoothstep(-aa_width, aa_width, outer);
        let stroke = stroke_alpha * input.frag_stroke_color;
        // Composite: fill inside sdf < 0, stroke ring at |sdf| < half_stroke
        let fill_alpha = smoothstep(-aa_width, aa_width, -sdf);
        let result = fill * fill_alpha + stroke * (1.0 - fill_alpha);
        return vec4<f32>(result.rgb, max(fill_alpha * fill.a, stroke.a));
    }

    return vec4<f32>(fill.rgb, fill.a * alpha);
}
"##;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shape_constants_have_expected_values() {
        assert_eq!(SHAPE_RECT, 0);
        assert_eq!(SHAPE_ROUNDED, 1);
        assert_eq!(SHAPE_ELLIPSE, 2);
        assert_eq!(SHAPE_LINE, 3);
    }

    #[test]
    fn parse_hex_color_3_digit() {
        // #fff -> full white
        let c = parse_hex_color("#fff");
        assert!((c[0] - 1.0).abs() < 0.01);
        assert!((c[1] - 1.0).abs() < 0.01);
        assert!((c[2] - 1.0).abs() < 0.01);
        assert!((c[3] - 1.0).abs() < 0.01);
    }

    #[test]
    fn parse_hex_color_6_digit() {
        // #dae8fc -> typical blue-ish fill
        let c = parse_hex_color("#dae8fc");
        assert!((c[0] - 0.855).abs() < 0.01);
        assert!((c[1] - 0.910).abs() < 0.01);
        assert!((c[2] - 0.988).abs() < 0.01);
        assert!((c[3] - 1.0).abs() < 0.01);
    }

    #[test]
    fn parse_hex_color_8_digit_with_alpha() {
        // #6c8ebf80 -> half alpha
        let c = parse_hex_color("#6c8ebf80");
        assert!((c[0] - 0.424).abs() < 0.01);
        assert!((c[1] - 0.557).abs() < 0.01);
        assert!((c[2] - 0.749).abs() < 0.01);
        assert!((c[3] - 0.502).abs() < 0.01);
    }

    #[test]
    fn parse_hex_color_invalid_fallback() {
        let c = parse_hex_color("not-a-color");
        assert_eq!(c, [0.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn parse_hex_color_invalid_format() {
        let c = parse_hex_color("#XYZ");
        assert_eq!(c, [0.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn parse_hex_color_empty_fallback() {
        let c = parse_hex_color("");
        assert_eq!(c, [0.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn parse_hex_color_black() {
        let c = parse_hex_color("#000000");
        assert_eq!(c, [0.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn parse_hex_color_red() {
        let c = parse_hex_color("#ff0000");
        assert!((c[0] - 1.0).abs() < 0.01);
        assert!((c[1] - 0.0).abs() < 0.01);
        assert!((c[2] - 0.0).abs() < 0.01);
        assert!((c[3] - 1.0).abs() < 0.01);
    }
}
