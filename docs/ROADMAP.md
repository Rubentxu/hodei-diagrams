# Roadmap — Hodei Diagrams

Estado vivo del proyecto. Actualizar en cada milestone o cambiar de dirección.
Para rationale de decisiones, ver `docs/adr/`.

## Estado Actual

**v0.5.4 — Fases 0-4 completadas (Edges, Shapes, Multi-select, Text, Rotate/Flip).**
Motor Rust sólido con round-trip `.drawio` en archivo real de 4MB (21 celdas,
AWS-Admisión). 11 crates, 93+ tests Rust (75 unit + 18 golden), ~100+ tests E2E.
61 ADRs (0001-0061). UI con paridad ~40% vs draw.io. Próximo: Fase 5 — Layers.

| Crate | Capa | Status |
|-------|------|--------|
| `diagram-core` | Dominio | ✅ |
| `diagram-format-drawio` | Compatibilidad | ✅ |
| `diagram-commands` | Comandos | ✅ (12 commands) |
| `diagram-compat-testkit` | Testing | ✅ |
| `diagram-scene` | Proyección | ✅ |
| `diagram-render-svg` | Render SVG | ✅ |
| `diagram-render-wgpu` | Render WebGPU | ✅ |
| `diagram-wasm` | WASM Bridge | ✅ (12 exports) |
| `diagram-routing` | Routing | ✅ (engine) / ⚠️ (UI) |
| `diagram-layout` | Layout | ✅ (engine) / ⚠️ (UI) |
| `web-shell/` | UI (TypeScript) | ✅ viewer + editor mínimo |

> **v1.0.0 NO se alcanzará automáticamente.** El release de v1.0.0 será
> decisión del usuario cuando considere que el producto está estable.
> Hasta entonces, las versiones siguen el patrón `v0.X.Y` con cadencia
> continua.

---

## 🎯 Active Track: Paridad Funcional con draw.io

**Plan documentado en ADRs 0050-0061.** Fases 0-4 completadas. La UI tiene
**~40% de paridad** con draw.io. El plan cubre 8 fases secuenciales.
**Fase 5 (Layers)** es el próximo objetivo.

| Fase | Tag | Foco | ADRs | Estado |
|------|-----|------|------|--------|
| 0. Edges interactivos | v0.9.0 | Conectores en UI | 0050, 0051 | ✅ Completada |
| 1. Shape catalog | v0.10.0 | Diamond, Triangle, Hexagon, Cylinder, Cloud, Parallelogram, Trapezoid, Polygon | 0052, 0053 | ✅ Completada |
| 2. Multi-selection | v0.11.0 | Set selection, batch commands, marquee, copy/paste | 0054, 0055 | ✅ Completada |
| 3. Text editing | v0.12.0 | Inline label edit (desbloquea 6 tests skipped) | 0056 | ✅ Completada |
| 4. Rotate/flip | v0.13.0 | Transform en geometry, resize handles | 0057 | ✅ Completada |
| 5. Layers | v0.14.0 | Z-order, lock, visibility, ordering | 0058 | 🔲 Pendiente |
| 6. Stencils | v0.15.0 | UML, BPMN, Flowchart, AWS (open source subset) | 0059 | ⏸️ Deferred |
| 7. Snap/align | v0.16.0 | Snap to grid, guides, alignment, distribute | 0060 | ⏸️ Deferred |
| 8. Effects | v0.17.0 | Shadow, glass, gradient (SVG-native) | 0061 | ⏸️ Deferred |
| **v1.0.0** | **NO automático** | Decisión del usuario | — | — |

### Fase 0 — Edges interactivos (PR-E1)
- **Rust**: `ConnectVerticesCommand`, `DisconnectEdgeCommand`, edge.style routing
- **WASM**: `connect_vertices(from, to, routing_kind)`, `route_all_edges()`
- **TS**: `Editor.connectMode`, two-click creation, ESC cancel, hover preview
- **Tests**: 25 E2E (crear/mover/undo/disconnect)
- **ADRs**: 0050, 0051

### Fase 1 — Shape catalog (PR-S1, S2)
- **Rust**: ShapeKind nuevos (Diamond, Triangle, Hexagon, Cylinder, Cloud, Parallelogram, Trapezoid), PolygonElement
- **Rust (scene/renderer)**: nuevos VisualElements + SVG paths
- **Rust (format)**: to_raw/from_raw
- **TS (sidebar)**: Basic expandida con thumbnails
- **Tests**: 20 E2E + round-trip por shape
- **ADRs**: 0052, 0053

### Fase 2 — Multi-selection (PR-M1, M2)
- **TS**: `Set<SlotmapId>` selection, marquee, batch commands via Transaction
- **TS**: copy/paste (internal clipboard v1, system clipboard v2)
- **Engine**: sin cambios (selection-agnostic)
- **Tests**: 30 E2E (multi-select, batch move/delete, copy/paste)
- **ADRs**: 0054, 0055

### Fase 3 — Text editing (PR-T1)
- **TS**: dbl-click → DOM overlay input, F2, Enter, Escape, debounce 200ms
- **Engine**: usa `EditVertexLabel` existente
- **Tests**: 6 E2E (un-skip de los actuales skipped)
- **ADR**: 0056

### Fase 4 — Rotate/flip (PR-R1, R2)
- **Rust**: `CellGeometry` con rotation/flip_h/flip_v
- **Rust (commands)**: RotateCommand, FlipCommand
- **Rust (format)**: round-trip `mxGeometry rotate="45"`
- **TS (editor)**: rotate con R, flip con H/V, resize handles (corner only v1)
- **Tests**: 15 E2E
- **ADR**: 0057

### Fase 5 — Layers (PR-L1, L2)
- **Rust**: `Vertex.z_order`, `locked`, `visible`
- **Rust (commands)**: BringToFront, SendToBack, BringForward, SendBackward
- **TS (inspector)**: Behavior tab con Lock/Visibility
- **TS (bottom)**: Layers panel opcional
- **Tests**: 15 E2E
- **ADR**: 0058

### Fase 6 — Stencils (PR-ST1, ST2)
- **Rust (format)**: parser stencils.xml (draw.io subset)
- **WASM**: `parse_stencil(url)`
- **TS (sidebar)**: cargar stencils bundled (general, uml, bpmn, flowchart)
- **TS (palette)**: drag-stencil-to-canvas
- **Tests**: 20 E2E
- **ADR**: 0059

### Fase 7 — Snap/align (PR-SP1, SP2)
- **TS**: snap to grid (8px), snap to shape, guides visuales
- **TS (editor)**: align (Left/Center/Right/Top/Middle/Bottom), distribute, make-same-size
- **Engine**: nuevos `ResizeVertex` command(s)
- **Tests**: 15 E2E
- **ADR**: 0060

### Fase 8 — Effects (PR-EFF1, EFF2)
- **Rust (scene)**: ResolvedStyle con shadow, glass, gradient
- **Rust (renderer)**: SVG `<filter>`, `<linearGradient>`, defs por página
- **TS (inspector)**: controles shadow/glass/gradient
- **Tests**: 15 E2E
- **ADR**: 0061

---

## ⏸️ Deferred (no en plan activo, documentados en ADR-0048)

- Version history timeline (IndexedDB)
- Properties dialog (Metadata en DiagramModel)
- Presentation mode advanced (F11, fullscreen)
- Real-time collaboration (CRDT)
- AI assistant (LLM integration)
- Backend / cloud sync (offline-first, ADR-0002)

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
| 0047 | Web Shell UI v1 — 5-Zone Application Layout | UI |
| 0048 | Deferred Innovations (History, Properties, Presentation) | v2 |
| 0049 | UI Gap Alignment + Slice Plan | UI |
| 0050 | **Edge Creation UX Contract** 🆕 | Phase 0 |
| 0051 | **Connect/Disconnect Commands** 🆕 | Phase 0 |
| 0052 | **Shape Catalog** 🆕 | Phase 1 |
| 0053 | **Polygon Generalization** 🆕 | Phase 1 |
| 0054 | **Multi-Selection Model** 🆕 | Phase 2 |
| 0055 | **Copy/Paste Strategy** 🆕 | Phase 2 |
| 0056 | **Inline Text Editing UX** 🆕 | Phase 3 |
| 0057 | **Rotation/Flip Geometry** 🆕 | Phase 4 |
| 0058 | **Layer/Ordering Model** 🆕 | Phase 5 |
| 0059 | **Stencil Format Spec** 🆕 | Phase 6 |
| 0060 | **Snap/Guides/Alignment** 🆕 | Phase 7 |
| 0061 | **Advanced Visual Effects** 🆕 | Phase 8 |

## Reglas de Actualización

- Este documento se actualiza al completar cada milestone o cambiar de dirección.
- No duplica rationale de ADRs — solo referencia a ellos.
- El estado "actual" de AGENTS.md referencia aquí.
- `DESIGN.md` es la visión de producto; este ROADMAP es el plan de ejecución.
- **v1.0.0 NO se publica automáticamente.** Será decisión explícita del usuario.
