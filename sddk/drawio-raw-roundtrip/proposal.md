# Kernel Proposal: drawio-raw-roundtrip

## Intent

Implementar el primer comportamiento real del motor: un round-trip funcional sobre un subset de `.drawio`.
Esto convierte el workspace bootstrapped (que compila pero no hace nada) en un sistema que puede leer y escribir XML `.drawio` preservando la estructura básica.

## Context Gate

| Knowledge Coverage | Quality | Taxonomy | Extra Effort |
|--------------------|---------|----------|--------------|
| sufficient | C2 | parse/write symmetry, preserve-unknown, domain-model-gaps | deepen |

## Knowledge Alignment

- Roadmap / Backlog: `docs/ROADMAP.md` (feat/drawio-roundtrip-v1, in progress)
- Work Items / Specs: None yet — this proposal creates the first spec
- ADR / Architecture Sources: ADR-0024 (preserve unknown), ADR-0025 (diagnostics), ADR-0026 (raw model first), ADR-0027 (raw stays in format crate), ADR-0029 (defer upstream study)
- Ownership Source: Single-author, no external ownership
- Prior Learnings: sddk-explore findings (RawDrawioDocument/Diagram/Cell well-shaped; ModelStore redesign needed; 6 stub round-trip methods)

## Lens Routing

| Lens | Delegation | Status | Proposal Impact |
|------|------------|--------|----------------|
| base-discipline | kernel | applied | minimal — focused on parse/write/verify |
| entropy-sdd | kernel | skipped | low-risk change, heuristic envelope sufficient |
| cognicode-sdd | kernel | skipped | no refactoring, no architecture changes |

## Scope

### In Scope

- `diagram-format-drawio`: implementar `parse_drawio` y `write_drawio` funcionales sobre el subset raw
- `diagram-compat-testkit`: fixture `simple-rect.drawio`, test round-trip básico
- `RawDrawioModel`: asegurar que las estructuras `RawDrawioDocument`, `Diagram`, `Cell` cubren el subset necesario
- Compatibilidad básica: el XML escrito debe ser parseable de nuevo

### Out Of Scope

- Domain mapping (Vertex/Edge/Group payload types) — Phase 2
- Engine facade
- Scene projection
- any rendering

## Invariants

- `diagram-format-drawio` NO depende de ningún crate fuera de `diagram-core`
- El XML escrito debe poder parsearse de nuevo sin errores
- Los métodos stubs actuales se reemplazan, no se agregan al lado

## Domain Language

- **Raw round-trip**: parse `.drawio` XML → `RawDrawioDocument` → escribir `.drawio` XML, sin mapping a domain types
- **Simple-rect fixture**: `<mxGraphModel><root><mxCell id="0"/><mxCell id="1"><mxGeometry/></mxCell></root></mxGraphModel>` mínimo
- **Page size**: hardcodeado en writer (A4-ish); no se preserva del fixture ni es configurable en Phase 1
- **id=0/1**: celdas con estos ids se strippean en parser; writer nunca los genera

## Capabilities

### New Capabilities

- `parse_drawio`: `fn parse_drawio(xml: &str) -> Result<RawDrawioDocument, DrawioError>`
- `write_drawio`: `fn write_drawio(doc: &RawDrawioDocument) -> Result<String, DrawioError>`
- `roundtrip_simple_rect`: test que parsea el fixture, lo escribe, y verifica que la estructura se preserva

### Modified Capabilities

- None yet

## Approach

### Two-phase delivery

**Phase 1 — Raw Round-Trip (this change)**
1. Implementar `parse_drawio` y `write_drawio` sobre las estructuras raw existentes
2. Autor del fixture `simple-rect.drawio` (un rectángulo mínimo)
3. Test en `diagram-compat-testkit`: parse → write → parse, verificar `mxCell` count
4. Compatibilidad: warnings en `Diagnostics` para elementos no soportados

**Phase 2 — Domain Mapping (next change)**
1. Rediseñar `ModelStore` para retener tipos Vertex
2. Mapear `RawDrawioDocument` → domain model
3. Round-trip completo con domain types

### Decisions (resueltas en grill-with-docs, 2026-06-18)

1. **parse/write shims**: SÍ — añadir funciones públicas `parse_drawio`/`write_drawio` en `diagram-format-drawio`. API público simple sobre `DrawioParser::parse_str` y `DrawioWriter::write_string`.
2. **Page size**: FIJO — writer hardcodea page size (A4-ish). Page size es out of scope para v1; se modela cuando `Page` del domain tenga dimensiones.
3. **id=0/1**: STRIP — parser descarta cells con `id == "0"` o `id == "1"`; writer nunca los genera.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `diagram-format-drawio/src/parser.rs` | high | stub → implementación real |
| `diagram-format-drawio/src/writer.rs` | high | stub → implementación real |
| `diagram-format-drawio/src/raw.rs` | medium | posibles ajustes de tipos |
| `diagram-compat-testkit/src/roundtrip.rs` | high | test stub → test real |
| `diagram-compat-testkit/fixtures/` | high | nuevo fixture |

## Entropy Budget

| Metric | Estimate | Status |
|--------|----------|--------|
| Existing change entropy | low | OK — focused single-method implementation |
| New connascence | minimal | OK — format crate isolated from rest |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| ModelStore redesign needed for Phase 2 but not in scope | medium | Keep Phase 1 strictly raw-only; document ModelStore gap as Phase 2 precondition |
| quick-xml edge cases (namespaces, attributes) | low | Start with simple-rect; add diagnostics for unknowns |

## Rollback Plan

Eliminar el cuerpo de `parse_drawio`/`write_drawio` y volver a los stubs `Err`/`""`. Revertir el fixture y el test. Cargo check sigue verde.

## Success Criteria

- [ ] `cargo check --workspace` pasa sin errores
- [ ] `cargo nextest run --workspace` tiene al menos 1 test pasando (round-trip simple-rect)
- [ ] `parse_drawio(simple_rect_xml)` retorna `Ok(RawDrawioDocument)` con celdas de contenido (id=0/1 strippeados)
- [ ] `write_drawio(parse_drawio(xml))` produce XML que parsea de nuevo sin error
- [ ] Las 3 decisiones están documentadas en el proposal (✓ grill-with-docs, 2026-06-18)
