# ADR-0037: Eager Style Resolution in diagram-scene

## Status

Accepted

## Context

ADR-0015 centralizes semantic interpretation in the engine. ADR-0021 says style typing happens gradually. ADR-0024 says unknown data must be preserved when safe. Two placements were considered for style resolution:

- **Eager (in scene builder)** — Resolve `StyleMap → ResolvedStyle` during `SceneBuilder::build`. The scene carries fully-resolved styles. Renderers receive typed fields.
- **Lazy (in renderer)** — Each renderer receives raw `StyleMap` and resolves styles itself. Renderers duplicate resolution logic.

## Decision

`diagram-scene` resolves styles eagerly during `SceneBuilder::build`. `StyleResolver::resolve(&self, &StyleMap) -> ResolvedStyle` produces a typed struct of hot keys (`fill_color`, `stroke_color`, `rounded`, `dashed`, `font_*`, `opacity`) plus a `remaining: StyleMap` field that preserves every unknown key. `StyleResolver::default()` is permissive (known keys typed, unknown preserved).

## Rationale

ADR-0015 explicitly centralizes semantic interpretation in the engine — the scene is where that lives. Lazy resolution would leak semantic knowledge into every renderer, producing resolution drift between SVG and WebGPU. Each renderer re-implementing `fillColor → #RGB` parsing is an ADR-0015 violation.

The cost of eager resolution (slightly bigger scenes with `remaining` repeated per element) is negligible against the cost of resolution drift. `remaining: StyleMap` honors ADR-0024: no unknown key is dropped.

A future `StrictStyleResolver` (returns `Result<ResolvedStyle, _>` and errors on unknown keys) can be added as a separate impl without changing the scene shape or the public API. Renderers that want raw keys can still read `remaining`; renderers that want typed fast paths read the hot fields.

## Consequences

**Enables:**
- Deterministic scene output: same model → byte-identical `ResolvedStyle` every time.
- Golden snapshot tests: `scene_to_string(&scene)` is stable across runs.
- Renderers receive pre-resolved styles: no duplicate parsing logic.
- `remaining` preserves unknown keys per ADR-0024.
- Future `StrictStyleResolver` as a separate impl.

**Constrains:**
- Scenes carry fully-resolved styles (slight memory overhead vs. lazy).
- Style changes require scene re-projection (acceptable — scene is cheap to rebuild).
- `StyleResolver` must be updated when new draw.io style keys are discovered.

## References

- Proposal: `sddk/diagram-scene/proposal.md`
- Spec: `sddk/diagram-scene/spec.md` (scenario C3)
- Design: `sddk/diagram-scene/design.md`
- ADR-0015: Renderers consume a scene, not core model
- ADR-0021: Start styles as flexible map, then type gradually
- ADR-0024: Preserve unknown when safe, degrade explicitly
