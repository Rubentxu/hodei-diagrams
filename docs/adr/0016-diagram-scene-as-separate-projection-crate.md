# `diagram-scene` as a Separate Projection Crate

Hodei Diagrams will define scene generation in a dedicated crate such as `diagram-scene` instead of folding that responsibility into `diagram-core` or into any concrete renderer. The decision is to make visual projection an explicit boundary between the Diagram Engine's domain model and the render backends, so that scene semantics can evolve independently while remaining shared across SVG today and future accelerated renderers.
