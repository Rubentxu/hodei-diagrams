//! # diagram-format-drawio
//!
//! Parser and writer for `.drawio` XML files. This crate depends only on
//! `diagram-core`; it must not reach into layout, routing, scene, or web
//! concerns.
//!
//! The crate first parses XML into a raw drawio model (`raw` module), then
//! maps that raw model to the diagram-core domain model (`mapping` module).
//! Round-tripping is the contract; see `docs/adr/0006-behavior-first-study-upstream-second.md`
//! and `docs/adr/0026-parse-drawio-into-raw-model-before-domain-mapping.md`.
//!
//! See `docs/adr/0014-drawio-format-depends-only-on-diagram-core.md`.

#![deny(missing_docs)]

pub mod error;
pub mod mapping;
pub mod parser;
pub mod raw;
pub mod writer;

pub use error::{FormatError, FormatResult};
pub use mapping::DrawioMapping;
pub use parser::DrawioParser;
pub use raw::{RawDrawioCell, RawDrawioDiagram, RawDrawioDocument};
pub use writer::DrawioWriter;