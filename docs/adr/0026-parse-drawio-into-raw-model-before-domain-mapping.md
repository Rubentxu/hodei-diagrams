# Parse `.drawio` into a Raw Model Before Domain Mapping

Hodei Diagrams will parse `.drawio` inputs into an intermediate raw or parsed model before mapping them into `diagram-core`, instead of deserializing XML straight into the engine domain model. The decision is to separate format understanding from domain interpretation so that unknown data preservation, compatibility diagnostics, and mapping logic can evolve independently without coupling XML structure directly to the Rust-native engine model.
