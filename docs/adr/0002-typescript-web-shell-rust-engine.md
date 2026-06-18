# TypeScript Web Shell over a Rust Diagram Engine

The browser client for Hodei Diagrams will be a minimal TypeScript Web Shell rather than a Rust-first frontend framework. The decision is to keep browser hosting concerns in a thin shell while the Rust Diagram Engine owns diagram state, editing rules, compatibility behavior, and render scene generation.
