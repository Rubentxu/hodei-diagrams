# Roadmap — Hodei Diagrams

Estado vivo del proyecto. Actualizar en cada milestone o cambio de dirección.
Para rationale de decisiones, ver `docs/adr/`.

## Estado Actual

**v0.5.4 — 8 crates + web-shell viewer + editor v1.1 + exportDrawio + diagram-routing v1.** 250+83 unit tests + 4 golden routing tests + 25 E2E tests en web-shell. 44 ADRs (0001-0044). 22 PRs mergeados.

| Crate | Status |
|-------|--------|
| `diagram-core` | ✅ |
| `diagram-format-drawio` | ✅ |
| `diagram-commands` | ✅ |
| `diagram-compat-testkit` | ✅ |
| `diagram-scene` | ✅ |
| `diagram-render-svg` | ✅ |
| `diagram-wasm` | ✅ |
| `diagram-routing` | ✅ |
| `web-shell` (viewer v1) | ✅ |

## Active Track

### Milestones Completados

| Milestone | PRs | Status |
|-----------|-----|--------|
| `feat/drawio-raw-roundtrip-v1` | #1 | ✅ |
| `feat/domain-mapping-v1` | #1 | ✅ |
| `feat/roundtrip-completo` | #2 | ✅ |
| `feat/diagram-commands-v1` | #3, #4, #5 | ✅ |
| `feat/diagram-scene` | #6, #7, #8, #9, #10 | ✅ |
| `feat/diagram-render-svg` | #11, #12, #13, #14 | ✅ |
| `feat/diagram-wasm` | #15, #16, #17, #18, #19 | ✅ |
| `feat/web-shell-v1` | #20 | ✅ |
| `feat/diagram-routing` | #22 (current) | 🔄 PR open |

## Chained Milestones

- [x] `diagram-scene` — proyección visual intermedia ✅
- [x] `diagram-render-svg` — renderer SVG ✅
- [x] `diagram-wasm` — thin WASM adapter ✅
- [x] `web-shell` (viewer v1) ✅
- [x] `web-shell` (editor surface v1.1) — click, drag, palette, command execution ✅
- [x] `diagram-wasm` (export_drawio) — enable "Save as .drawio" ✅
- [x] `diagram-routing` — orthogonal edge routing v1 ✅
- [x] `diagram-layout` — Sugiyama HierarchicalLayout v1 (4-stage pipeline, TopToBottom + LeftToRight) ✅
- [ ] `diagram-render-wgpu` — renderer WebGPU

## External Study Triggers

| Crate | Qué estudiar | Cuándo |
|-------|-------------|--------|
| `diagram-routing` | `mxEdgeStyle`, orthogonal routing, waypoints en mxGraph | antes de sddk-propose de routing |
| `diagram-layout` | algoritmos Sugiyama-style, layout heuristics | antes de sddk-propose de layout |
| Compatibilidad | corpus grande `.drawio` para validar round-trip | después de domain mapping |

Ubicación prevista de clones: `/var/home/rubentxu/Proyectos/rust/_upstream/` (ignorado en .gitignore)

## ADR Inventory (índice rápido)

| ADR | Tema |
|-----|------|
| 0001 | Semantic Port with .drawio Compatibility |
| 0002 | TypeScript Web Shell over Rust Engine |
| 0003 | SVG First Render Backend, WebGPU Later |
| 0004 | Minimal WASM Boundary with Shared Buffers |
| 0005 | Command-Driven Engine, Not Literal Redux Store |
| 0006 | Behavior First, Upstream Code Second |
| 0007 | v1 Targets Solid Basic-to-Medium Compatibility |
| 0008 | Import .drawio Before Rich Authoring |
| 0009 | Rust-Native Model with .drawio Mapping |
| 0010 | Foundational Crate Matrix by Layer |
| 0011 | Multi-crate Workspace with Hexagonal Boundaries |
| 0012 | Separate Core from Commands and Keep Web Outside crates/ |
| 0013 | Keep Layout and Routing Outside diagram-core |
| 0014 | diagram-format-drawio Depends Only on diagram-core |
| 0015 | Renderers Consume Scene, Not Core Model |
| 0016 | diagram-scene as Separate Projection Crate |
| 0017 | diagram-wasm as Thin Technical Adapter |
| 0018 | Shared Compatibility Testkit Early |
| 0019 | Bootstrap with Core, Format, and Compat Testkit |
| 0020 | Core Model Starts with Pages, Groups, Styles, and Labels |
| 0021 | Start Styles as Flexible Map, Then Type Gradually |
| 0022 | Model Labels as Potentially Rich Content |
| 0023 | Engine-Owned Stable IDs with External ID Mapping |
| 0024 | Preserve Unknown When Safe, Degrade Explicitly |
| 0025 | Compatibility Diagnostics from Bootstrap |
| 0026 | Parse .drawio into Raw Model Before Domain Mapping |
| 0027 | Keep Raw Drawio Model Inside Format Crate for Now |
| 0028 | Bootstrap with Separated Pieces Before Engine Facade |
| 0029 | Defer Upstream Repo Cloning Until Routing/Layout Phase |
| 0030 | Style as Flexible Map, Gradual Typing |
| 0031 | Label as Potentially Rich Content |
| 0032 | Engine-Owned Stable IDs with External Mapping |
| 0033 | JS/TS Latest Stable Version Policy |
| 0034 | Document Roles and Update Authority |
| 0035 | Gitignore Policy |
| 0036 | Hybrid Scene Structure |
| 0037 | Eager Style Resolution in Scene |
| 0038 | Multi-Page SVG Output |
| 0039 | Remaining StyleMap to Style Attribute |
| 0040 | Diagram-WASM Dependency Clarification |
| 0041 | Web Shell Vite + Vitest + Playwright Toolchain |
| 0042 | Web Shell Editor Surface v1.1 |
| 0043 | diagram-commands depends on diagram-format-drawio for IdMap storage |
| 0044 | Routing Architecture — Data vs Algorithm |

## Reglas de Actualización

- Este documento se actualiza al completar cada milestone o cambiar de dirección.
- No duplica rationale de ADRs — solo ссылается a ellos.
- El estado "actual" de AGENTS.md ссылается aquí.
