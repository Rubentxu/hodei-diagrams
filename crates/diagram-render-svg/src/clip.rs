//! Clip path management for SVG output.

/// Manages clip-path definitions with a monotonic counter per page.
pub(crate) struct ClipPathManager {
    counter: usize,
    defs_buf: String,
}

impl ClipPathManager {
    /// Create a new manager with counter at 0 and empty defs buffer.
    pub(crate) fn new() -> Self {
        Self {
            counter: 0,
            defs_buf: String::new(),
        }
    }

    /// Register a clip path for the given bounds.
    ///
    /// Returns the clip ID (e.g., `0` for the first clip).
    /// The formatted `<clipPath>` element is appended to the defs buffer.
    pub(crate) fn register(&mut self, x: f64, y: f64, width: f64, height: f64) -> usize {
        let id = self.counter;
        self.defs_buf.push_str("  <clipPath id=\"clip_");
        self.defs_buf.push_str(&id.to_string());
        self.defs_buf.push_str("\"><rect x=\"");
        self.defs_buf.push_str(&x.to_string());
        self.defs_buf.push_str("\" y=\"");
        self.defs_buf.push_str(&y.to_string());
        self.defs_buf.push_str("\" width=\"");
        self.defs_buf.push_str(&width.to_string());
        self.defs_buf.push_str("\" height=\"");
        self.defs_buf.push_str(&height.to_string());
        self.defs_buf.push_str("\"/></clipPath>\n");
        self.counter += 1;
        id
    }

    /// Render the `<defs>` block containing all registered clip paths.
    ///
    /// Returns an empty string if no clips were registered.
    pub(crate) fn render_defs(&self, indent: usize) -> String {
        if self.defs_buf.is_empty() {
            String::new()
        } else {
            format!("<defs>\n{}{}</defs>", self.defs_buf, "  ".repeat(indent))
        }
    }
}

impl Default for ClipPathManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_manager_has_zero_counter() {
        let mgr = ClipPathManager::new();
        assert_eq!(mgr.counter, 0);
    }

    #[test]
    fn register_returns_incrementing_ids() {
        let mut mgr = ClipPathManager::new();
        let id0 = mgr.register(0.0, 0.0, 100.0, 100.0);
        let id1 = mgr.register(10.0, 10.0, 50.0, 50.0);
        assert_eq!(id0, 0);
        assert_eq!(id1, 1);
    }

    #[test]
    fn register_formats_clip_path() {
        let mut mgr = ClipPathManager::new();
        mgr.register(50.0, 50.0, 200.0, 150.0);
        assert!(mgr.defs_buf.contains("<clipPath id=\"clip_0\">"));
        assert!(mgr.defs_buf.contains("x=\"50\""));
        assert!(mgr.defs_buf.contains("y=\"50\""));
        assert!(mgr.defs_buf.contains("width=\"200\""));
        assert!(mgr.defs_buf.contains("height=\"150\""));
    }

    #[test]
    fn render_defs_empty_when_no_clips() {
        let mgr = ClipPathManager::new();
        assert_eq!(mgr.render_defs(0), "");
    }

    #[test]
    fn render_defs_emits_defs_block() {
        let mut mgr = ClipPathManager::new();
        mgr.register(0.0, 0.0, 100.0, 100.0);
        let result = mgr.render_defs(0);
        assert!(result.starts_with("<defs>"));
        assert!(result.contains("</defs>"));
    }

    #[test]
    fn counter_increments_per_register() {
        let mut mgr = ClipPathManager::new();
        mgr.register(0.0, 0.0, 10.0, 10.0);
        mgr.register(0.0, 0.0, 10.0, 10.0);
        mgr.register(0.0, 0.0, 10.0, 10.0);
        assert_eq!(mgr.counter, 3);
    }

    #[test]
    fn two_clips_produce_clip_0_and_clip_1() {
        let mut mgr = ClipPathManager::new();
        mgr.register(0.0, 0.0, 100.0, 100.0);
        mgr.register(0.0, 0.0, 200.0, 200.0);
        assert!(mgr.defs_buf.contains("clip_0"));
        assert!(mgr.defs_buf.contains("clip_1"));
        assert!(!mgr.defs_buf.contains("clip_2"));
    }
}
