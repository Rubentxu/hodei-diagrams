# Create a Shared Compatibility Testkit Early

Hodei Diagrams will introduce a shared testing crate early, such as `diagram-compat-testkit`, to host real `.drawio` corpora, round-trip checks, observable scenarios, and shared compatibility assertions across the workspace. The decision is to treat compatibility as a first-class product contract with a dedicated testing boundary instead of letting those checks fragment into crate-local implementation tests.
