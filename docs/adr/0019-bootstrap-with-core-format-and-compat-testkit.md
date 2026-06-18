# Bootstrap with Core, Format, and Compatibility Testkit

The first implementable cut of Hodei Diagrams will start with `diagram-core`, `diagram-format-drawio`, and a shared compatibility testkit before introducing scene projection or SVG rendering crates. The decision is to prove the Semantic Port first through parsing, model mapping, and compatibility validation against real `.drawio` inputs, so visual projection is added on top of a verified contract rather than used to hide an unproven foundation.
