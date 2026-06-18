# Use Engine-Owned Stable IDs with External ID Mapping

Hodei Diagrams will use engine-owned stable identifiers for internal entities such as cells and pages, while preserving explicit mappings to external `.drawio` identifiers at the compatibility boundary. The decision is to keep the Diagram Engine's identity model independent from imported file semantics so the core can normalize, reindex, and optimize safely without letting external compatibility IDs become the domain's internal source of truth.
