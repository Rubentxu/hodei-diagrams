# ADR-0039: remaining StyleMap to style attribute

## Decision

`ResolvedStyle.remaining: StyleMap` is emitted as a single trailing `style="k1=v1;k2=v2"` attribute on the rendered element. Keys are serialized in BTreeMap lexicographic order (deterministic). Values are XML-escaped via `escape_attr`. Keys are not escaped.

## Context

ADR-0024 mandates preserve-unknown style keys. Without this decision, the renderer has no rule for where to put the unknown keys — on the element as a presentation attribute (round-trip safe with draw.io's own SVG export) or in a separate sidecar (forbidden by ADR-0003 self-containment).

## Rationale

draw.io's SVG export uses the same `style="…"` shape; matching it keeps the export and any draw.io re-import behavior-compatible. Lexicographic order guarantees byte-stable output (spec §C5).

## Consequences

- Typed `ResolvedStyle` fields are emitted **before** `remaining` (so an unknown key that shadows a typed key wins — matches CSS specificity and draw.io export). Locked by spec §C3 golden test.
- Values are escaped to prevent XSS in re-imported content.
