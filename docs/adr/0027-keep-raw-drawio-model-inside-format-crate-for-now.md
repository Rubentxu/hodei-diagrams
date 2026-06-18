# Keep the Raw `.drawio` Model Inside the Format Crate for Now

Hodei Diagrams will keep the intermediate raw or parsed `.drawio` model inside `diagram-format-drawio` for now instead of extracting a separate crate such as `diagram-format-drawio-raw` during the bootstrap phase. The decision is to preserve the conceptual separation between raw format parsing and domain mapping without introducing extra workspace bureaucracy before there is clear reuse pressure or scaling evidence that justifies another crate boundary.
