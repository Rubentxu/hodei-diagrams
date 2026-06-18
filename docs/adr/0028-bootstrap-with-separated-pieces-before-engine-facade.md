# Bootstrap with Separated Pieces Before an Engine Facade

Hodei Diagrams will bootstrap with separated crates and compose them first in tests or tooling instead of introducing a top-level `diagram-engine` or `diagram-kernel` facade immediately. The decision is to validate real architectural boundaries before freezing a convenience layer, so the early workspace exposes coupling honestly and lets the eventual engine facade emerge from proven composition pressure rather than from premature API design.
