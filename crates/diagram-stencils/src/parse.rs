//! XML parser for draw.io stencil format.

use std::collections::HashSet;

use quick_xml::events::Event;
use quick_xml::reader::Reader;

use crate::error::{Diagnostic, StencilError};
use crate::{Aspect, PathCommand, SpdxId, Stencil};

/// Parses a full stencil library XML file (multiple `<shape>` elements).
///
/// Returns all successfully parsed stencils, each with coordinates as they appear
/// in the XML (not normalized). Malformed shapes emit diagnostics but do not
/// cause the whole file to fail.
///
/// If no shapes are parsed successfully, returns an empty vector.
pub fn parse_stencil_library(xml: &str) -> Result<Vec<Stencil>, StencilError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();

    // State machine
    let mut library_name: Option<String> = None;
    let mut in_shapes = false;

    let mut results: Vec<Stencil> = Vec::new();

    // Per-shape state (reset after each </shape>)
    let mut shape_name: Option<String> = None;
    let mut shape_w: f64 = 0.0;
    let mut shape_h: f64 = 0.0;
    let mut shape_aspect = Aspect::Variable;

    let mut in_background = false;
    let mut in_foreground = false;

    let mut background: Vec<PathCommand> = Vec::new();
    let mut foreground: Vec<PathCommand> = Vec::new();

    let mut license: Option<SpdxId> = None;
    let mut encountered_unsupported: HashSet<String> = HashSet::new();
    let mut diagnostics: Vec<Diagnostic> = Vec::new();

    /// Finalize the current shape and add to results.
    #[allow(clippy::too_many_arguments)]
    fn finalize_shape(
        shape_name: Option<String>,
        shape_w: f64,
        shape_h: f64,
        shape_aspect: Aspect,
        background: &[PathCommand],
        foreground: &[PathCommand],
        license: Option<SpdxId>,
        diagnostics: &[Diagnostic],
        library_name: &Option<String>,
        results: &mut Vec<Stencil>,
    ) {
        let library = library_name.clone().unwrap_or_else(|| "unknown".to_owned());
        let name = shape_name.unwrap_or_else(|| "unnamed".to_owned());

        results.push(Stencil {
            library,
            name,
            width: shape_w,
            height: shape_h,
            aspect: shape_aspect,
            background: background.to_vec(),
            foreground: foreground.to_vec(),
            license,
            diagnostics: diagnostics.to_vec(),
        });
    }

    /// Reset per-shape state for the next shape.
    fn reset_shape_state(
        shape_name: &mut Option<String>,
        shape_w: &mut f64,
        shape_h: &mut f64,
        shape_aspect: &mut Aspect,
        background: &mut Vec<PathCommand>,
        foreground: &mut Vec<PathCommand>,
        encountered_unsupported: &mut HashSet<String>,
    ) {
        *shape_name = None;
        *shape_w = 0.0;
        *shape_h = 0.0;
        *shape_aspect = Aspect::Variable;
        background.clear();
        foreground.clear();
        encountered_unsupported.clear();
    }

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();

                match name.as_str() {
                    "shapes" => {
                        in_shapes = true;
                        for attr in e.attributes().with_checks(false).flatten() {
                            let key = attr.key.as_ref();
                            let val = std::str::from_utf8(&attr.value)
                                .map(|s| s.to_owned())
                                .unwrap_or_default();
                            if key == b"name" {
                                library_name = Some(val);
                            }
                        }
                    }
                    "shape" if in_shapes => {
                        // Reset per-shape state for new shape
                        reset_shape_state(
                            &mut shape_name,
                            &mut shape_w,
                            &mut shape_h,
                            &mut shape_aspect,
                            &mut background,
                            &mut foreground,
                            &mut encountered_unsupported,
                        );
                        // Reset per-shape license/diagnostics
                        license = None;
                        diagnostics.clear();

                        let mut w: Option<String> = None;
                        let mut h: Option<String> = None;
                        let mut aspect_str: Option<String> = None;

                        for attr in e.attributes().with_checks(false).flatten() {
                            let key = attr.key.as_ref();
                            let val = std::str::from_utf8(&attr.value)
                                .map(|s| s.to_owned())
                                .unwrap_or_default();
                            match key {
                                b"name" => shape_name = Some(val),
                                b"w" => w = Some(val),
                                b"h" => h = Some(val),
                                b"aspect" => aspect_str = Some(val),
                                _ => {}
                            }
                        }

                        shape_w = w.and_then(|s| s.parse().ok()).unwrap_or(0.0);
                        shape_h = h.and_then(|s| s.parse().ok()).unwrap_or(0.0);
                        shape_aspect = aspect_str
                            .as_deref()
                            .map(Aspect::from_str)
                            .unwrap_or(Aspect::Variable);
                        // NOTE: For Start events (non-self-closing), finalize on </shape> End event
                    }
                    "background" => {
                        in_background = true;
                    }
                    "foreground" => {
                        in_foreground = true;
                    }
                    "path" => {
                        // Path element - content parsed in Text handler
                    }
                    _ => {}
                }
            }
            Ok(Event::Empty(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();

                match name.as_str() {
                    "shapes" => {
                        // Self-closing <shapes/> - rare but possible
                        in_shapes = true;
                        for attr in e.attributes().with_checks(false).flatten() {
                            let key = attr.key.as_ref();
                            let val = std::str::from_utf8(&attr.value)
                                .map(|s| s.to_owned())
                                .unwrap_or_default();
                            if key == b"name" {
                                library_name = Some(val);
                            }
                        }
                    }
                    "shape" if in_shapes => {
                        // Self-closing <shape ... /> - finalize immediately
                        reset_shape_state(
                            &mut shape_name,
                            &mut shape_w,
                            &mut shape_h,
                            &mut shape_aspect,
                            &mut background,
                            &mut foreground,
                            &mut encountered_unsupported,
                        );
                        license = None;
                        diagnostics.clear();

                        let mut w: Option<String> = None;
                        let mut h: Option<String> = None;
                        let mut aspect_str: Option<String> = None;

                        for attr in e.attributes().with_checks(false).flatten() {
                            let key = attr.key.as_ref();
                            let val = std::str::from_utf8(&attr.value)
                                .map(|s| s.to_owned())
                                .unwrap_or_default();
                            match key {
                                b"name" => shape_name = Some(val),
                                b"w" => w = Some(val),
                                b"h" => h = Some(val),
                                b"aspect" => aspect_str = Some(val),
                                _ => {}
                            }
                        }

                        shape_w = w.and_then(|s| s.parse().ok()).unwrap_or(0.0);
                        shape_h = h.and_then(|s| s.parse().ok()).unwrap_or(0.0);
                        shape_aspect = aspect_str
                            .as_deref()
                            .map(Aspect::from_str)
                            .unwrap_or(Aspect::Variable);

                        finalize_shape(
                            shape_name.clone(),
                            shape_w,
                            shape_h,
                            shape_aspect,
                            &background,
                            &foreground,
                            license.clone(),
                            &diagnostics,
                            &library_name,
                            &mut results,
                        );
                        // Reset for next shape
                        reset_shape_state(
                            &mut shape_name,
                            &mut shape_w,
                            &mut shape_h,
                            &mut shape_aspect,
                            &mut background,
                            &mut foreground,
                            &mut encountered_unsupported,
                        );
                        license = None;
                        diagnostics.clear();
                    }
                    "background" => {
                        in_background = true;
                    }
                    "foreground" => {
                        in_foreground = true;
                    }
                    "path" => {
                        // Empty <path/> - nothing to parse
                    }
                    "text" | "gradient" | "image" if !encountered_unsupported.contains(&name) => {
                        encountered_unsupported.insert(name.clone());
                        let location = if in_background {
                            "background"
                        } else if in_foreground {
                            "foreground"
                        } else {
                            "shape"
                        };
                        diagnostics.push(Diagnostic::new(
                            format!("<{}>", name),
                            format!("unsupported element '{}' in {} - skipped", name, location),
                        ));
                    }
                    "fillstroke" if in_background || in_foreground => {
                        let target = if in_background { &mut background } else { &mut foreground };
                        target.push(PathCommand::FillStroke);
                    }
                    "fill" if in_background || in_foreground => {
                        let target = if in_background { &mut background } else { &mut foreground };
                        target.push(PathCommand::Fill);
                    }
                    "stroke" if in_background || in_foreground => {
                        let target = if in_background { &mut background } else { &mut foreground };
                        target.push(PathCommand::Stroke);
                    }
                    _ if in_background || in_foreground => {
                        if !encountered_unsupported.contains(&name) {
                            encountered_unsupported.insert(name.clone());
                            let location = if in_background { "background" } else { "foreground" };
                            diagnostics.push(Diagnostic::new(
                                format!("<{}>", name),
                                format!("unsupported element '{}' in {} - skipped", name, location),
                            ));
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match name.as_str() {
                    "background" => in_background = false,
                    "foreground" => in_foreground = false,
                    "shapes" => {
                        in_shapes = false;
                    }
                    "shape" if in_shapes => {
                        // Finalize the current shape
                        finalize_shape(
                            shape_name.clone(),
                            shape_w,
                            shape_h,
                            shape_aspect,
                            &background,
                            &foreground,
                            license.clone(),
                            &diagnostics,
                            &library_name,
                            &mut results,
                        );
                        // Reset for next shape (if any)
                        reset_shape_state(
                            &mut shape_name,
                            &mut shape_w,
                            &mut shape_h,
                            &mut shape_aspect,
                            &mut background,
                            &mut foreground,
                            &mut encountered_unsupported,
                        );
                        license = None;
                        diagnostics.clear();
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(e)) => {
                if in_background || in_foreground {
                    let text = std::str::from_utf8(e.as_ref()).unwrap_or("");
                    if !text.trim().is_empty() {
                        let cmds = parse_path_commands(text);
                        if in_background {
                            background.extend(cmds);
                        } else {
                            foreground.extend(cmds);
                        }
                    }
                }
            }
            Ok(Event::Comment(e)) => {
                // Check for license comments: <!-- license: MIT -->
                let text = std::str::from_utf8(e.as_ref()).unwrap_or("");
                let text = text.trim();
                if let Some(license_str) = text.strip_prefix("license:") {
                    license = Some(SpdxId::from_str(license_str.trim()));
                }
            }
            Ok(Event::Eof) => {
                // If we exit without seeing </shapes>, finalize any pending shape
                if in_shapes && shape_name.is_some() {
                    finalize_shape(
                        shape_name,
                        shape_w,
                        shape_h,
                        shape_aspect,
                        &background,
                        &foreground,
                        license,
                        &diagnostics,
                        &library_name,
                        &mut results,
                    );
                }
                break;
            }
            Err(e) => {
                return Err(StencilError::Xml(e.to_string()));
            }
            _ => {}
        }
        buf.clear();
    }

    Ok(results)
}

/// Parse a draw.io stencil XML string into a [`Stencil`].
pub fn parse_stencil(xml: &str) -> Result<Stencil, StencilError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();

    // State machine
    let mut library_name: Option<String> = None;
    let mut in_shapes = false;

    let mut shape_name: Option<String> = None;
    let mut shape_w: f64 = 0.0;
    let mut shape_h: f64 = 0.0;
    let mut shape_aspect = Aspect::Variable;

    let mut in_background = false;
    let mut in_foreground = false;

    let mut background: Vec<PathCommand> = Vec::new();
    let mut foreground: Vec<PathCommand> = Vec::new();

    let mut license: Option<SpdxId> = None;
    let mut encountered_unsupported: HashSet<String> = HashSet::new();
    let mut diagnostics: Vec<Diagnostic> = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();

                match name.as_str() {
                    "shapes" => {
                        in_shapes = true;
                        for attr in e.attributes().with_checks(false).flatten() {
                            let key = attr.key.as_ref();
                            let val = std::str::from_utf8(&attr.value)
                                .map(|s| s.to_owned())
                                .unwrap_or_default();
                            if key == b"name" {
                                library_name = Some(val);
                            }
                        }
                    }
                    "shape" if in_shapes => {
                        let mut w: Option<String> = None;
                        let mut h: Option<String> = None;
                        let mut aspect_str: Option<String> = None;

                        for attr in e.attributes().with_checks(false).flatten() {
                            let key = attr.key.as_ref();
                            let val = std::str::from_utf8(&attr.value)
                                .map(|s| s.to_owned())
                                .unwrap_or_default();
                            match key {
                                b"name" => shape_name = Some(val),
                                b"w" => w = Some(val),
                                b"h" => h = Some(val),
                                b"aspect" => aspect_str = Some(val),
                                _ => {}
                            }
                        }

                        shape_w = w.and_then(|s| s.parse().ok()).unwrap_or(0.0);
                        shape_h = h.and_then(|s| s.parse().ok()).unwrap_or(0.0);
                        shape_aspect = aspect_str
                            .as_deref()
                            .map(Aspect::from_str)
                            .unwrap_or(Aspect::Variable);
                    }
                    "background" => {
                        in_background = true;
                    }
                    "foreground" => {
                        in_foreground = true;
                    }
                    "path" => {
                        // For empty <path/> elements, we look for text content
                        // The actual parsing happens in Event::Text handler
                        if e.is_empty() {
                            // Empty path element - nothing to parse
                        }
                    }
                    "text" | "gradient" | "image" if !encountered_unsupported.contains(&name) => {
                        encountered_unsupported.insert(name.clone());
                        let location = if in_background {
                            "background"
                        } else if in_foreground {
                            "foreground"
                        } else {
                            "shape"
                        };
                        diagnostics.push(Diagnostic::new(
                            format!("<{}>", name),
                            format!("unsupported element '{}' in {} - skipped", name, location),
                        ));
                    }
                    "fillstroke" if in_background || in_foreground => {
                        let target = if in_background { &mut background } else { &mut foreground };
                        target.push(PathCommand::FillStroke);
                    }
                    "fill" if in_background || in_foreground => {
                        let target = if in_background { &mut background } else { &mut foreground };
                        target.push(PathCommand::Fill);
                    }
                    "stroke" if in_background || in_foreground => {
                        let target = if in_background { &mut background } else { &mut foreground };
                        target.push(PathCommand::Stroke);
                    }
                    _ if in_background || in_foreground => {
                        if !encountered_unsupported.contains(&name) {
                            encountered_unsupported.insert(name.clone());
                            let location = if in_background { "background" } else { "foreground" };
                            diagnostics.push(Diagnostic::new(
                                format!("<{}>", name),
                                format!("unsupported element '{}' in {} - skipped", name, location),
                            ));
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match name.as_str() {
                    "background" => in_background = false,
                    "foreground" => in_foreground = false,
                    "shapes" => in_shapes = false,
                    _ => {}
                }
            }
            Ok(Event::Text(e)) => {
                if in_background || in_foreground {
                    let text = std::str::from_utf8(e.as_ref()).unwrap_or("");
                    if !text.trim().is_empty() {
                        let cmds = parse_path_commands(text);
                        if in_background {
                            background.extend(cmds);
                        } else {
                            foreground.extend(cmds);
                        }
                    }
                }
            }
            Ok(Event::Comment(e)) => {
                // Check for license comments: <!-- license: MIT -->
                let text = std::str::from_utf8(e.as_ref()).unwrap_or("");
                let text = text.trim();
                if let Some(license_str) = text.strip_prefix("license:") {
                    license = Some(SpdxId::from_str(license_str.trim()));
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                return Err(StencilError::Xml(e.to_string()));
            }
            _ => {}
        }
        buf.clear();
    }

    let library = library_name.ok_or(StencilError::MissingRoot)?;
    let name = shape_name.ok_or(StencilError::MissingShape)?;

    Ok(Stencil {
        library,
        name,
        width: shape_w,
        height: shape_h,
        aspect: shape_aspect,
        background,
        foreground,
        license,
        diagnostics,
    })
}

/// Parse path command text into PathCommandVec.
fn parse_path_commands(text: &str) -> Vec<PathCommand> {
    let mut commands = Vec::new();
    let tokens: Vec<&str> = text.split_whitespace().collect();
    let mut i = 0;

    while i < tokens.len() {
        let token = tokens[i].trim();
        if token.is_empty() {
            i += 1;
            continue;
        }

        let cmd = token.chars().next().unwrap_or(' ');
        let rest = &token[1..];

        match cmd {
            'M' | 'm' => {
                // Move: x,y
                if let Some((x, y)) = parse_two_floats(rest) {
                    commands.push(PathCommand::Move { x, y });
                } else if i + 1 < tokens.len() {
                    i += 1;
                    if let Some((x, y)) = parse_two_floats(tokens[i]) {
                        commands.push(PathCommand::Move { x, y });
                    }
                }
            }
            'L' | 'l' => {
                // Line: x,y
                if let Some((x, y)) = parse_two_floats(rest) {
                    commands.push(PathCommand::Line { x, y });
                } else if i + 1 < tokens.len() {
                    i += 1;
                    if let Some((x, y)) = parse_two_floats(tokens[i]) {
                        commands.push(PathCommand::Line { x, y });
                    }
                }
            }
            'Q' | 'q' => {
                // Quad: cx,cy x,y
                if i + 1 < tokens.len() {
                    let (cx, cy) = parse_two_floats(tokens[i]).unwrap_or((0.0, 0.0));
                    i += 1;
                    if let Some((x, y)) = parse_two_floats(tokens[i]) {
                        commands.push(PathCommand::Quad { cx, cy, x, y });
                    }
                }
            }
            'C' | 'c' => {
                // Curve: c1x,c1y c2x,c2y x,y
                if i + 2 < tokens.len() {
                    let (c1x, c1y) = parse_two_floats(tokens[i]).unwrap_or((0.0, 0.0));
                    i += 1;
                    let (c2x, c2y) = parse_two_floats(tokens[i]).unwrap_or((0.0, 0.0));
                    i += 1;
                    if let Some((x, y)) = parse_two_floats(tokens[i]) {
                        commands.push(PathCommand::Curve {
                            c1x,
                            c1y,
                            c2x,
                            c2y,
                            x,
                            y,
                        });
                    }
                }
            }
            'A' | 'a' => {
                // Arc: rx,ry x-axis-rotation large-arc sweep x,y
                if i + 6 < tokens.len() {
                    let (rx, ry) = parse_two_floats(tokens[i]).unwrap_or((0.0, 0.0));
                    i += 1;
                    let (x_axis_rotation, large_arc) =
                        parse_two_floats(tokens[i]).unwrap_or((0.0, 0.0));
                    i += 1;
                    let (sweep, x, y) = parse_two_floats_3(tokens[i]).unwrap_or((0.0, 0.0, 0.0));
                    commands.push(PathCommand::Arc {
                        rx,
                        ry,
                        x_axis_rotation,
                        large_arc: large_arc != 0.0,
                        sweep: sweep != 0.0,
                        x,
                        y,
                    });
                }
            }
            'Z' | 'z' => {
                commands.push(PathCommand::Close);
            }
            _ => {}
        }
        i += 1;
    }
    commands
}

/// Parse "x,y" into two f64 values.
fn parse_two_floats(s: &str) -> Option<(f64, f64)> {
    let parts: Vec<&str> = s.split(',').collect();
    if parts.len() >= 2 {
        let x = parts[0].trim().parse().ok()?;
        let y = parts[1].trim().parse().ok()?;
        return Some((x, y));
    }
    None
}

/// Parse "x,y,z" into three f64 values.
fn parse_two_floats_3(s: &str) -> Option<(f64, f64, f64)> {
    let parts: Vec<&str> = s.split(',').collect();
    if parts.len() >= 3 {
        let a = parts[0].trim().parse().ok()?;
        let b = parts[1].trim().parse().ok()?;
        let c = parts[2].trim().parse().ok()?;
        return Some((a, b, c));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_minimal_stencil() {
        let xml = r#"<shapes name="test"><shape name="Box" w="80" h="40"/></shapes>"#;
        let stencil = parse_stencil(xml).unwrap();
        assert_eq!(stencil.library, "test");
        assert_eq!(stencil.name, "Box");
        assert_eq!(stencil.width, 80.0);
        assert_eq!(stencil.height, 40.0);
        assert_eq!(stencil.aspect, Aspect::Variable);
    }

    #[test]
    fn parse_fixed_aspect() {
        let xml =
            r#"<shapes name="test"><shape name="Circle" w="40" h="40" aspect="fixed"/></shapes>"#;
        let stencil = parse_stencil(xml).unwrap();
        assert_eq!(stencil.aspect, Aspect::Fixed);
    }

    #[test]
    fn parse_path_commands_helper() {
        let text = "M 0,0 L 10,10 Q 20,20 30,30 C 0,0 10,10 20,20 A 5,5 0 0 1 10,10 Z";
        let cmds = parse_path_commands(text);
        assert!(matches!(cmds.first(), Some(PathCommand::Move { x, y }) if *x == 0.0 && *y == 0.0));
        assert!(matches!(cmds.last(), Some(PathCommand::Close)));
    }

    #[test]
    fn parse_with_background_path() {
        let xml = r#"<shapes name="general">
            <shape name="Rect" w="80" h="40">
                <background>
                    <path>M 0,0 L 80,0 L 80,40 L 0,40 Z</path>
                </background>
            </shape>
        </shapes>"#;
        let stencil = parse_stencil(xml).unwrap();
        assert_eq!(stencil.background.len(), 5); // M + 4 L + Z
    }

    #[test]
    fn license_detection() {
        let xml = r#"<!-- license: MIT -->
        <shapes name="test"><shape name="Box" w="80" h="40"/></shapes>"#;
        let stencil = parse_stencil(xml).unwrap();
        assert_eq!(stencil.license, Some(SpdxId::Mit));
    }

    #[test]
    fn unsupported_element_emits_diagnostic() {
        let xml = r#"<shapes name="test">
            <shape name="WithText" w="80" h="40">
                <background><path>M 0,0 L 80,0 L 80,40 Z</path></background>
                <foreground><text/></foreground>
            </shape>
        </shapes>"#;
        let stencil = parse_stencil(xml).unwrap();
        assert!(!stencil.diagnostics.is_empty());
        assert!(
            stencil
                .diagnostics
                .iter()
                .any(|d| d.message.contains("unsupported element"))
        );
    }

    #[test]
    fn apache_license_detection() {
        let xml = r#"<!-- license: Apache-2.0 --><shapes name="test"><shape name="Box" w="80" h="40"/></shapes>"#;
        let stencil = parse_stencil(xml).unwrap();
        assert_eq!(stencil.license, Some(SpdxId::Apache20));
    }

    // ─── parse_stencil_library tests ─────────────────────────────────────────────

    #[test]
    fn parse_library_multiple_shapes() {
        let xml = r#"<shapes name="test">
            <shape name="A" w="100" h="50"><background><path>M 0,0 L 100,0 L 100,50 Z</path></background></shape>
            <shape name="B" w="80" h="80"><background><path>M 0,0 L 80,0 Z</path></background></shape>
        </shapes>"#;
        let stencils = parse_stencil_library(xml).unwrap();
        assert_eq!(stencils.len(), 2);
        assert_eq!(stencils[0].name, "A");
        assert_eq!(stencils[0].width, 100.0);
        assert_eq!(stencils[0].height, 50.0);
        assert_eq!(stencils[1].name, "B");
        assert_eq!(stencils[1].width, 80.0);
        assert_eq!(stencils[1].height, 80.0);
    }

    #[test]
    fn parse_library_single_shape() {
        let xml = r#"<shapes name="test"><shape name="Only" w="60" h="30"/></shapes>"#;
        let stencils = parse_stencil_library(xml).unwrap();
        assert_eq!(stencils.len(), 1);
        assert_eq!(stencils[0].name, "Only");
    }

    #[test]
    fn parse_library_empty_returns_empty_vec() {
        let xml = r#"<shapes name="empty"></shapes>"#;
        let stencils = parse_stencil_library(xml).unwrap();
        assert!(stencils.is_empty());
    }

    #[test]
    fn parse_library_library_name_applied_to_all() {
        let xml = r#"<shapes name="mylib">
            <shape name="Shape1" w="10" h="10"/>
            <shape name="Shape2" w="20" h="20"/>
        </shapes>"#;
        let stencils = parse_stencil_library(xml).unwrap();
        assert_eq!(stencils.len(), 2);
        assert_eq!(stencils[0].library, "mylib");
        assert_eq!(stencils[1].library, "mylib");
    }

    #[test]
    fn parse_library_preserves_paths() {
        let xml = r#"<shapes name="test">
            <shape name="WithPath" w="100" h="50">
                <background><path>M 0,0 L 50,25 L 100,50 Z</path></background>
            </shape>
        </shapes>"#;
        let stencils = parse_stencil_library(xml).unwrap();
        assert_eq!(stencils.len(), 1);
        assert_eq!(stencils[0].background.len(), 4); // M + 2 L + Z
    }

    #[test]
    fn parse_library_diagnostic_per_stencil() {
        let xml = r#"<shapes name="test">
            <shape name="Good" w="10" h="10"><background><path>M 0,0 L 10,0 Z</path></background></shape>
            <shape name="Bad" w="10" h="10"><background><path>M 0,0 Z</path><text/></background></shape>
        </shapes>"#;
        let stencils = parse_stencil_library(xml).unwrap();
        assert_eq!(stencils.len(), 2);
        // First shape has no unsupported elements
        assert!(stencils[0].diagnostics.is_empty());
        // Second shape has unsupported <text/>
        assert!(!stencils[1].diagnostics.is_empty());
    }

    #[test]
    fn parse_library_self_closing_shape_finalizes() {
        // Self-closing <shape ... /> should finalize immediately
        let xml = r#"<shapes name="test"><shape name="Tail" w="5" h="5"/></shapes>"#;
        let stencils = parse_stencil_library(xml).unwrap();
        assert_eq!(stencils.len(), 1, "Expected 1 shape, got {:?}", stencils);
        assert_eq!(stencils[0].name, "Tail");
    }
}
