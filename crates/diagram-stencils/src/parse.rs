//! XML parser for draw.io stencil format.

use std::collections::HashSet;

use quick_xml::events::Event;
use quick_xml::reader::Reader;

use crate::error::{Diagnostic, StencilError};
use crate::{Aspect, PathCommand, SpdxId, Stencil};

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
}
