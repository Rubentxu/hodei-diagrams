# Visual Audit — 2026-06-20

## Bug crítico descubierto por auditoría visual

La auditoría visual con capturas reales (VLM-assisted) reveló un bug grave que los
tests funcionales no detectaban:

- `crates/diagram-render-svg/src/renderer.rs` emitía siempre
  `viewBox="0 0 1 1"` cuando la página tenía tamaño por defecto (1×1)
- El rect `width="80" height="40"` se escalaba a **71360 × 35680 px** en el DOM
- Resultado: shapes invisibles (completamente fuera del viewport visible)
- DOM funcionalmente correcto, visualmente roto

### Fix aplicado

`effective_view_box(page)`:
- Si la página tiene tamaño > 1, usa el tamaño explícito
- Si no, calcula el viewBox a partir del `content_bounds` del `display_list`
- Recursivo para grupos anidados
- Fallback a 1×1 si no hay contenido

## Evidencia visual recopilada

| Caso | viewBox | Shapes | Resultado |
|------|---------|--------|-----------|
| `simple-rect.drawio` (1 rect 80×40) | `0 0 80 40` | 1 | ✅ Visible, dimensions correct |
| `multi-shapes.drawio` (7 rects) | `20 20 420 260` | 7 | ✅ VLM: "7 distinct black shapes, clearly different rectangles with visible spacing" |
| `two-page.drawio` | `0 0 80 40` | 1 | ✅ Tab navigation visible, page 1 rendered |
| `aws-admision.drawio` (4MB, 21 cells) | `-480 -720 2908 3370` | 21 | ✅ Container groups rendered, fill/stroke colors verified via DOM |

## Lo que se ve ahora correctamente

- ✅ SVG visible con dimensiones correctas en viewport
- ✅ Multi-shape fixture muestra 7 rectángulos distintos
- ✅ Fixtures reales (incluido el de 4MB) producen DOM con shapes inspeccionables
- ✅ Fill y stroke colors preservados del `.drawio` original
- ✅ Page tabs funcionales (Page 1 / Page 2)
- ✅ HUD reporta selección correctamente

## Gaps visuales identificados (documentados, no resueltos aquí)

1. **Selection handles en SVG**: el `.selected` class se aplica pero sin bordes de selección visibles en el rect — el usuario percibe la selección solo por el HUD
2. **Visual regression sin snapshots reales**: las suites `visual-regression.spec.ts` validan estructura DOM, no píxeles
3. **Bordes por defecto**: shapes sin `strokeColor` muestran fill negro sólido (esperado por defecto SVG/CSS)
4. **Container groups en archivo 4MB**: aparecen como bloques grandes negros — comportamiento correcto pero visualmente confuso sin zoom

## Justfile reescrito para ser totalmente automatizable

### Antes
- `just dev` → fallaba porque `wasm-pack --out-dir ../../web-shell/src/wasm` resolvía mal
- Sin validación de pre-requisitos
- Sin auto-instalación de `node_modules`

### Ahora
- `just dev` ejecuta: `doctor → ensure-deps → web-wasm → vite`
- Usa **rutas absolutas** para `--out-dir` (la raíz del problema)
- `_check-wasm-prereqs` falla rápido si falta wasm-pack/node/cargo
- `_ensure-deps` instala npm solo si `node_modules` no existe
- `just doctor` muestra estado completo del entorno
- `just e2e`, `just ci`, `just web-build` como one-shots completos

## Métricas finales

| Suite | Resultado |
|-------|-----------|
| Vitest unit | 83/83 ✅ |
| Playwright E2E | 167/174 ✅ (7 skipped = gaps reales documentados) |
| Rust tests | 375+/375+ ✅ (render-svg: 40, scene: 48, commands: 46, etc.) |
| Visual regression estructural | 6/6 ✅ (no snapshots píxel-perfect aún) |

## Acciones tomadas

1. `fix(render): derive viewBox from content bounds` (commit `87952d1`)
2. `justfile`: pipeline totalmente automatizable con validación
3. Fixture nuevo: `multi-shapes.drawio` para validación visual reproducible
