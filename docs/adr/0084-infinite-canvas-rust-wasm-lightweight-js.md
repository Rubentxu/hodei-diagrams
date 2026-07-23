# ADR-0084: Infinite Canvas con Motor Rust/WASM y Cliente JS Ligero

**Estado**: propuesta
**Fecha**: 2026-07-23
**Decisor**: Haizea + equipo

---

## Contexto

El proyecto Hodei Diagrams nació como "Semantic Port de draw.io" con un modelo de canvas basado en páginas de tamaño fijo. Esta decisión simplificó el bootstrap inicial pero limita la UX a画 diagramas que caben en una página.

El objetivo es evolucionar hacia un **canvas infinito** que sea:
1. **100% compatible con .drawio** — cualquier archivo abre sin pérdida de datos
2. **Competitivo en UX** — users de Excalidraw/tldraw se sienten en casa
3. **Arquitectura eficiente** — motor pesado en Rust/WASM, cliente JS ligero

---

## Decisión

Se adopta **canvas infinito como modelo de renderizado primario**, con las siguientes reglas:

### 1. Modelo de datos: agnóstico del canvas

El `diagram-core` (motor Rust) no conoce el concepto de "canvas finito". El `Page` existe como contenedor de shapes, pero **no define límites de edición**. Un shape puede existir en cualquier coordenada (x, y) ∈ ℝ².

```
Page {
  id: PageId,
  name: String,
  display_list: Vec<DisplayItem>,  // vertices + edges
  // SIN pageWidth/pagePageHeight como límites
}
```

### 2. Viewport como estado de presentación

El viewport (pan + zoom) es **estado del cliente JS**, no del motor Rust. El motor produce el `Scene` completo; el cliente decide qué porción renderizar.

```typescript
// Estado de cámara en el cliente JS (web-shell)
interface Viewport {
  panX: number;      // offset X del pan en document coords
  panY: number;      // offset Y del pan en document coords
  zoom: number;       // factor de zoom (1.0 = 100%)
  width: number;      // ancho del viewport en pixels
  height: number;     // alto del viewport en pixels
}
```

### 3. Compatibilidad con .drawio via initial viewport hint

Al abrir un `.drawio`:
- Si el XML contiene `pageWidth`/`pageHeight` → usar esos valores como **initial viewport** (centrado, zoom to fit con padding)
- Si no hay dimensiones → viewport inicial en `(0, 0)` con zoom 1.0
- **Los shapes fuera del pageWidth/pageHeight original siguen siendo visibles** — el canvas es infinito

```xml
<!-- .drawio -->
<diagram pageWidth="800" pageHeight="600">
  <!-- shapes pueden estar en x=5000, y=-300 sin problema -->
</diagram>
```

### 4. Motor en Rust/WASM, cliente JS ligero

```
┌─────────────────────────────────────────────────────────┐
│  Web Shell (TypeScript - ~2000 LOC)                    │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Viewport state: { panX, panY, zoom }           │  │
│  │  Event handlers: wheel, pointer, keyboard        │  │
│  │  DOM/SVG rendering: shapes + handles + overlay  │  │
│  │  WASM boundary: commands/events buffers          │  │
│  └──────────────────────────────────────────────────┘  │
│                         ↕ wasm-bindgen                  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Motor Rust (WASM)                               │  │
│  │                                                   │  │
│  │  diagram-core     ← dominio: vertices, edges,   │  │
│  │                         groups, geometry, style   │  │
│  │  diagram-commands  ← undo/redo, history         │  │
│  │  diagram-scene     ← display list projection     │  │
│  │  diagram-render-svg ← SVG string generation      │  │
│  │  diagram-format-drawio ← parser .drawio XML      │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Responsabilidades**:

| Capa | Responsabilidad |
|------|----------------|
| **Rust/WASM** | Parseo, dominio, comandos, undo/redo, scene generation, SVG string output, hit-testing, layout, routing |
| **JS (web-shell)** | Viewport state, event handling (wheel/pointer/keyboard), DOM updates, handle overlays, animation frame loop |

### 5. Viewport culling: deferred optimization

**Fase 1 (MVP)**: Sin culling. El renderer genera el SVG completo de la escena. Aceptable para diagramas < 500 shapes.

**Fase 2 (optimización)**: Viewport culling via quadtree spatial index en Rust. El renderer recibe un `ViewportBounds` y solo serializa shapes dentro del viewport + margin.

```
Nota: expand_page_if_needed() en diagram-commands/payload.rs
      Será deprecado en Fase 1. El canvas infinito no necesita expandir nada.
```

---

## Motivación

### Por qué canvas infinito ahora

1. ** draw.io parity real** — no hay pérdida de datos al abrir cualquier .drawio
2. **UX competitiva** — Excalidraw/tldraw son el estándar de facto
3. **Arquitectura limpia** — viewport es estado de presentación, no del dominio
4. **El esfuerzo es comparable** a hacer page-based "bien" con clips, zoom to fit, etc.

### Por qué Rust/WASM como motor

1. **Render performance** — SVG string generation + spatial queries en Rust son 10-100x más rápidos que JS para diagramas grandes
2. **Shared engine** — el mismo motor Rust sirve para CLI tools, headless rendering, stress testing
3. **Type safety** — el modelo de dominio en Rust con tipos大大的 reduce bugs de concurrencia y estado
4. **Binary size** — WASM es ~1-2MB, acceptable para web

### Por qué JS como cliente ligero

1. **DX del cliente** — manipulación directa del DOM, event handling, animation loops es más natural en JS
2. **Iteración rápida** — UI changes no requieren recompilar Rust
3. **Bundle size** — el web-shell puede ser lazy-loaded
4. **No es una app React** — es una thin layer, no un framework

---

## Consecuencias

### Positivas

- Cualquier .drawio abre sin pérdida de datos
- UX de canvas infinito con Excalidraw-like pan/zoom
- Motor compartible entre web, CLI, headless rendering
- Viewport es solo estado de presentación → testable de forma aislada

### Negativas

- **`expand_page_if_needed()` es código muerto** — se depreca en Fase 1
- **Coordenadas en dos espacios** — todos los handlers de pointer/keyboard necesitan `clientToDoc()` y `docToClient()`
- **Initial viewport decision** — al abrir .drawio con shapes dispersos, necesitamos heurística para el zoom inicial
- **Viewport culling deferred** — Fase 1 puede tener problemas de performance con >500 shapes

### Riesgo técnico: `clientToDoc` en cada pointer event

```
clientX, clientY (screen pixels)
       ↓
viewportTransform (panX, panY, zoom)
       ↓
docX, docY (document coordinates)
```

Todas las interacciones (drag shape, resize handle, create connection) dependen de esta transformación. Si el viewport state no está sincronizado con el frame loop, hay lag visual.

**Mitigación**: El viewport state vive en el web-shell y se actualiza directamente en el animation frame, sin pasar por Rust/WASM.

---

## Alternatives considered

### A: Page-based + auto-expand (status quo)

Mantener el modelo actual con `expand_page_if_needed()`.

**Rechazado porque**: No es compatible con .drawio files que tienen shapes fuera de pageWidth/pageHeight. El usuario que abre su diagrama de 300 shapes en Excalidraw y lo guarda como .drawio espera que Hodei lo abra completo.

### B: Canvas infinito mode + page-based mode (toggle)

Un flag global que elige el comportamiento.

**Rechazado porque**: Duplica la superficie de testing, confunde al usuario ("¿por qué no puedo hacer scroll en este modo?"), y no hay benefit de UX claro para mantener page-based.

### C: Canvas infinito puro, motor todo en JS

Sin Rust/WASM para el renderizado.

**Rechazado porque**: El proyecto nació con arquitectura hexagonal en Rust. El motor shared es una prioridad. JS-only para el renderer SVG pierde la oportunidad de shared engine.

---

## Plan de implementación

### Fase 1: MVP (2-3 semanas)

1. **Deprecar `expand_page_if_needed()`** — el canvas es infinito por naturaleza
2. **Añadir `Viewport` state en web-shell** — `{ panX, panY, zoom, width, height }`
3. **Implementar `clientToDoc()` / `docToClient()`** — todas las interacciones usan document coords
4. **Actualizar wheel handler** → zoom centrado en cursor
5. **Actualizar pointer drag** → pan cuando draguea en vacío (no en shape)
6. **Initial viewport heuristic** — al abrir .drawio, zoom to fit con padding del 10%
7. **Diagram export** → el SVG exportado usa el viewport actual, no toda la escena

### Fase 2: Viewport culling (1-2 semanas)

1. **Spatial index (quadtree)** en `diagram-core` → `spatial_index.rs`
2. **Renderer recibe `ViewportBounds`** → solo serializa shapes en viewport + margin
3. **Dirty rect tracking** → solo re-renderiza lo que cambió

### Fase 3: Performance & polish (continuo)

- WASM memory optimization (zero-copy buffers para commands/events)
- Animation frame budget monitoring
- Zoom snap points (fit, 100%, 50%, etc.)

---

## Referencias

- [Excalidraw infinite canvas](https://github.com/excalidraw/excalidraw)
- [tldraw viewport architecture](https://github.com/tldraw/tldraw)
- ADR-0077: Page-based canvas decision (para contraste)
- ADR-0010: Hexagonal architecture en Rust

---

*Esta decisión se revisará después de Fase 1 con datos de performance y UX real.*
