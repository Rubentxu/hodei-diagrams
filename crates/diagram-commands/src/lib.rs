//! Reversible mutation commands for DiagramModel.
//!
//! See ADR-0012 (split commands from core) and ADR-0031 (command shape + history contract).

#![deny(missing_docs)]

pub mod command;
pub mod editor;
pub mod error;
pub mod history;
pub mod payload;

pub use command::{Command, CompletedCommand};
pub use editor::{Editor, Transaction};
pub use error::{CommandError, CommandResult};
pub use history::History;
pub use payload::*;
