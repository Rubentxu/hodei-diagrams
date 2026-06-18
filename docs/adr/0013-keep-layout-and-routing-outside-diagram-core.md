# Keep Layout and Routing Outside `diagram-core`

Hodei Diagrams will keep layout and routing as separate crates that depend on `diagram-core` instead of embedding those algorithmic capabilities inside the core domain crate. The decision is to preserve a smaller and more stable Diagram Engine nucleus focused on model invariants, while letting layout and routing evolve independently as policies and algorithms that operate on the core model.
