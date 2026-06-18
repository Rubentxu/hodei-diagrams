//! # diagram-compat-testkit
//!
//! Shared compatibility testkit: corpus loading, round-trip helpers, golden
//! files, and compatibility assertions. Downstream crates depend on this
//! crate as a `dev-dependency` to assert that their behavior matches the
//! `.drawio` Behavioral Reference.
//!
//! See `docs/adr/0018-create-a-shared-compatibility-testkit-early.md` and
//! `docs/adr/0025-add-compatibility-diagnostics-from-bootstrap.md`.

#![deny(missing_docs)]

pub mod corpus;
pub mod diagnostics;
pub mod golden;
pub mod roundtrip;

pub use corpus::{CorpusEntry, CorpusWalker};
pub use diagnostics::Diagnostic;
pub use golden::{GoldenFixture, GoldenStore};
pub use roundtrip::{RoundtripReport, assert_roundtrip};
