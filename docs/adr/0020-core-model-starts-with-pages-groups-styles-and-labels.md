# Core Model Starts with Pages, Groups, Styles, and Labels

`diagram-core` will include pages, vertices, edges, groups, geometry, styles, and labels from the first model cut instead of treating pages, groups, or styling as later add-ons. The decision is to make the initial Rust-native model reflect the minimum useful `.drawio` contract, so the Semantic Port begins with a domain shape that can represent real diagrams rather than a simplified demo subset that would need structural rework immediately afterward.
