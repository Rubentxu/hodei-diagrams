# E2E Test Plan — Hodei Diagrams Web Shell

**Version:** 1.0  
**Status:** Active  
**Reference:** ADR-0047, ADR-0049, DESIGN.md  
**Current coverage:** 80 tests / 12 specs (v0.12.0)

---

## 1. Coverage Matrix

| Área funcional | ¿Motor? | ¿UI? | Tests actuales | Faltan |
|---|---|---|---|---|
| **Crear primitivas** | ✅ AddVertex | ✅ Palette + sidebar | 2 (palette) | 15+ |
| **Cargar .drawio** | ✅ import_drawio | ✅ File > Open | 6 (viewer) | 10+ |
| **Renderizado SVG** | ✅ render_svg | ✅ Canvas | 1 (smoke) | 8+ |
| **Zoom** | ❌ (CSS) | ✅ CSS transform | 0 | 5 |
| **Pan** | ❌ (CSS) | ✅ middle-drag | 0 | 5 |
| **Seleccionar** | ✅ hit-test | ✅ click | 2 | 3 |
| **Mover** | ✅ MoveVertex | ✅ drag | 2 | 3 |
| **Eliminar** | ✅ RemoveVertex | ✅ Delete key | 2 | 1 |
| **Undo/Redo** | ✅ History | ✅ Ctrl+Z/Y | 2 | 3 |
| **Estilos (Inspector)** | ✅ ChangeStyle | ✅ Style tab | 0 | 8 |
| **Texto (Inspector)** | ✅ ChangeStyle | ✅ Text tab | 0 | 5 |
| **Exportar .drawio** | ✅ export_drawio | ✅ Save button | 4 | 2 |
| **Exportar SVG** | ✅ render_svg | ✅ File > Export | 0 | 3 |
| **Navegación páginas** | ✅ render_pages | ✅ Page tabs | 1 | 4 |
| **Presentación** | ❌ (CSS) | ✅ View > Present | 2 | 2 |
| **Grid** | ❌ (CSS) | ✅ View > Grid | 2 | 1 |
| **Propiedades** | ❌ (localStorage) | ✅ File > Properties | 1 | 2 |
| **Errores** | ✅ JsValue | ✅ Toast | 2 | 6 |
| **Performance** | ❓ | ❓ | 0 | 4 |

---

## 2. Test Suites (por prioridad)

### 🔴 P1 — Funcionalidad básica

**A. Creación de primitivas** (`primitives-create.spec.ts`) — 10 tests
- Crear rect/elipse/rounded desde sidebar y palette
- Verificar data-vertex-id y dimensiones correctas
- Múltiples shapes, sidebar deselecciona tras crear

**B. Carga y renderizado** (`diagram-render.spec.ts`) — 10 tests
- Cargar simple-rect, archivo 4MB real, multi-página
- Verificar data-vertex-id, estilos (fillColor/strokeColor), edges como líneas, labels
- Archivo inválido → error, archivo vacío → sin error

**C. Zoom y Pan** (`canvas-zoom-pan.spec.ts`) — 9 tests
- Scroll wheel zoom in/out, zoom reset, HUD porcentaje
- Middle-click pan, pan persiste entre páginas, grid escala con zoom

**D. Selección y movimiento** (`shape-interaction.spec.ts`) — 7 tests
- Click selecciona, click cambia selección, drag mueve, umbral 3px
- Selección tras undo restaurada, tras cambiar página limpiada, HUD muestra info

### 🟡 P2 — Edición y estilos

**E. Estilos Inspector** (`inspector-style.spec.ts`) — 12 tests
- Fill/stroke color, stroke width, dashed, rounded, font family/size/color, bold/italic
- Sin selección no envía comando, debounce 300ms

**F. Edición texto** (`text-editing.spec.ts`) — 6 tests
- Doble click edita, Enter confirma, Escape cancela, click fuera confirma

**G. Undo/Redo avanzado** (`undo-redo-advanced.spec.ts`) — 6 tests
- Undo tras 5 shapes, redo restaura, undo estilo, botones disabled, Ctrl+Z no afecta inputs

### 🟢 P3 — Plataforma y edge cases

**H. Exportación** (`export-advanced.spec.ts`) — 5 tests
- Export .drawio XML válido, reimport mismo número shapes, export SVG válido

**I. Navegación** (`navigation-session.spec.ts`) — 6 tests
- Navegar páginas, tab activo, añadir/cerrar página, File > New, recargar

**J. Errores** (`error-recovery.spec.ts`) — 8 tests
- Comando inválido, toast cierre, error no bloquea, XML malformado, sin diagrama, WASM no carga, race condition

**K. Accesibilidad** (`accessibility-keyboard.spec.ts`) — 7 tests
- Tab navega zonas, atajos teclado, aria-label en botones

**L. Performance** (`performance.spec.ts`) — 4 tests
- 4MB < 3s, 50 shapes < 2s, zoom 200% < 500ms, mover < 100ms

**M. Regresión visual** (`visual-regression.spec.ts`) — 3 tests
- Snapshot simple-rect, snapshot rect rojo, grid overlay snapshot

---

## 3. Total planificado

| Prioridad | Suites | Tests |
|-----------|--------|-------|
| 🔴 P1 | A-D | 36 |
| 🟡 P2 | E-G | 24 |
| 🟢 P3 | H-M | 33 |
| **TOTAL** | **13 specs** | **93 tests** |

**Cobertura objetivo:** 80 actuales + 93 nuevos = **173 tests E2E**

---

## 4. Ejecución

| PR | Suites | Rama |
|----|--------|------|
| P1-A | A, B | `test/e2e-primitives-render` |
| P1-B | C, D | `test/e2e-zoom-interaction` |
| P2 | E, F, G | `test/e2e-styles-editing` |
| P3 | H-M | `test/e2e-platform-edge` |

Cada test que falle → bug real → se corrige en el mismo PR.
