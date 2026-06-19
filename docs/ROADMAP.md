# Roadmap — Hodei Diagrams

Estado vivo del proyecto. Actualizar en cada milestone o cambio de dirección.
Para rationale de decisiones, ver `docs/adr/`.

## Estado Actual

**v0.8.0 — Motor completo (11 crates) + web-shell viewer/editor.** 347 tests Rust + 83 tests Vitest + 21 tests Playwright E2E. 48 ADRs (0001-0048). 25 PRs mergeados. `DESIGN.md` establece la visión de producto.

| Crate | Capa | Status |
|-------|------|--------|
| `diagram-core` | Dominio | ✅ |
| `diagram-format-drawio` | Compatibilidad | ✅ |
| `diagram-commands` | Comandos | ✅ |
| `diagram-compat-testkit` | Testing | ✅ |
| `diagram-scene` | Proyección | ✅ |
| `diagram-render-svg` | Render SVG | ✅ |
| `diagram-render-wgpu` | Render WebGPU | ✅ |
| `diagram-wasm` | WASM Bridge | ✅ |
| `diagram-routing` | Routing | ✅ |
| `diagram-layout` | Layout | ✅ |
| `web-shell/` | UI (TypeScript) | ✅ viewer + editor básico |

---

## 🎯 Active Track: UI v1 — 5-Zone Application Layout

> **ADR-0047**: Web Shell UI v1 Architecture
> **DESIGN.md**: Layout philosophy, design system, visual personality

### Fase 1: web-shell-ui-layout (ahora)

**5 zonas tipo draw.io con motor real atrás. Nada fake.**

| Zona | Scope v1 | Motor |
|------|----------|-------|
| Top NavBar | File (Open/Save), Edit (Undo/Redo/Delete), View (Zoom) | `import_drawio`, `export_drawio`, `execute_command` |
| Left Sidebar | 1 categoría "General": Rect, RoundedRect, Ellipse. Resto gris. | Scene shapes |
| Central Canvas | SVG render + zoom/pan + page tabs + edge display | `render_svg`, `render_pages` |
| Right Inspector | Style tab (6 controles) + Text tab (5 controles). Arrange gris. | `ChangeStyle` via `execute_command` |
| Bottom | Page tabs (draw.io-style) + Diagnostics toast | `parse_drawio_with_diagnostics` |

- [ ] `feat/web-shell-ui-layout` — 5-zone skeleton + NavBar + Canvas zoom/pan + page tabs
- [ ] `feat/web-shell-ui-sidebar` — Left Sidebar con categorías + shape grid + drag-to-canvas
- [ ] `feat/web-shell-ui-inspector` — Right Inspector Style + Text tabs → `ChangeStyle`
- [ ] `feat/web-shell-ui-polish` — Design system (DESIGN.md colors/spacing/typography/motion), E2E tests, ADR-0047 final

### Fase 2: UI v1.1 — Shapes + Interactividad

- [ ] `diagram-scene shapes` — Diamond, Triangle shape support in scene builder
- [ ] `web-shell shapes` — Sidebar expande "General" con nuevos shapes funcionales
- [ ] `web-shell edges` — Edge creation interactiva en canvas (usa routing engine)
- [ ] `web-shell arrange` — Inspector Arrange tab (X/Y/W/H numéricos)
- [ ] `diagram-scene text` — Text element as first-class scene element

### Fase 3: UI v1.2 — Stencils + Export

- [ ] `web-shell stencils` — Carga de stencils .drawio XML (arrows, flowchart, UML)
- [ ] `web-shell formats` — Export SVG, PNG desde el engine
- [ ] `diagram-format-drawio stencils` — Parser de XML de stencils tipo draw.io

---

## 🔮 Innovations (v2)

> **ADR-0048**: Deferred Innovations — Version History, Properties, Presentation Mode

| Innovación | Motor requerido | Complejidad |
|-----------|----------------|-------------|
| Version History | IndexedDB + DiagramModel serde | Media |
| Properties Dialog | Metadata en DiagramModel | Baja |
| Presentation Mode | Fullscreen API (puro UI) | Baja |

---

## 🏗️ Engine — Completado

### Milestones Completados (25 PRs)

| # | Milestone | PRs | Tag |
|---|-----------|-----|-----|
| 1 | `feat/drawio-raw-roundtrip-v1` | #1 | — |
| 2 | `feat/domain-mapping-v1` | #1 | — |
| 3 | `feat/roundtrip-completo` | #2 | — |
| 4 | `feat/diagram-commands-v1` | #3, #4, #5 | v0.3.0 |
| 5 | `feat/diagram-scene` | #6, #7, #8, #9, #10 | v0.3.0 |
| 6 | `feat/diagram-render-svg` | #11, #12, #13, #14 | v0.4.0 |
| 7 | `feat/diagram-wasm` | #15, #16, #17, #18, #19 | v0.5.0 |
| 8 | `feat/web-shell-v1` (viewer) | #20 | v0.5.1 |
| 9 | `feat/web-shell-editor-v1` | #21 | v0.5.2 |
| 10 | `feat/diagram-wasm-export` | #22 | v0.5.3 |
| 11 | `feat/diagram-routing` | #23 | v0.6.0 |
| 12 | `feat/diagram-layout` | #24 | v0.7.0 |
| 13 | `feat/diagram-render-wgpu` | #25 | v0.8.0 |

---

## ⏳ External Study Triggers (completados)

| Crate | Qué se estudió | Estado |
|-------|---------------|--------|
| `diagram-routing` | `mxEdgeStyle.js`, OrthConnector, SegmentConnector | ✅ (repomix, 4 archivos) |
| `diagram-layout` | `mxHierarchicalLayout.js`, 4-stage Sugiyama pipeline | ✅ (repomix, 20 archivos) |
| Compatibilidad | Archivo real 4MB (AWS-Admision) — import/export OK | ✅ |

Ubicación de upstream: `/var/home/rubentxu/Proyectos/rust/_upstream/mxgraph/` (gitignored)

---

## 📋 ADR Inventory

| ADR | Tema | Fase |
|-----|------|------|
| 0001-0040 | Bootstrap, dominio, compatibilidad, crates | Engine |
| 0041 | Web Shell Toolchain (Vite + Vitest + Playwright) | UI |
| 0042 | Web Shell Editor Surface v1.1 | UI |
| 0043 | commands → format-drawio dep for IdMap | Engine |
| 0044 | Routing Architecture (Data vs Algorithm) | Engine |
| 0045 | Layout Architecture (Sugiyama pipeline) | Engine |
| 0046 | WebGPU Renderer Architecture | Engine |
| 0047 | **Web Shell UI v1 — 5-Zone Application Layout** 🆕 | UI |
| 0048 | **Deferred Innovations (History, Properties, Presentation)** 🆕 | v2 |

## Reglas de Actualización

- Este documento se actualiza al completar cada milestone o cambiar de dirección.
- No duplica rationale de ADRs — solo referencia a ellos.
- El estado "actual" de AGENTS.md referencia aquí.
- `DESIGN.md` es la visión de producto; este ROADMAP es el plan de ejecución.
