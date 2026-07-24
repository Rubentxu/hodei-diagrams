# ADR-0085: rAF Coalesced Render + Atomic Paste Transaction

**Estado**: aceptada
**Implementación**: v0.116.0 — `feat/replay-coalescing` (7 commits, branch `feat/replay-coalescing`)
**Fecha**: 2026-07-24
**Decisor**: Haizea + equipo

---

## Contexto

El `triggerReplay()` (~57 call sites en editor.ts) hacía dos cosas inseparables:

1. **scene sync**: actualizaba el scene cache leyendo del motor WASM (operación同步)
2. **render**: producía el SVG y hacía `innerHTML` swap (operación asíncrona deseada)

Esto causaba dos problemas:

### Problema 1: Render blocking

Cada mutación del motor (add, delete, move, paste, undo/redo) llamaba `triggerReplay()` síncronamente. Secuencias rápidas como "pegar 50 shapes" producían 50 renders secuenciales (~8ms cada uno = 400ms de main thread).

### Problema 2: Paste sin atomicidad

`paste()` construía un array de comandos `AddVertex` y los ejecutaba uno por uno via `#session.executeTransaction()` individual. Cada `executeTransaction` era atómico, pero el resultado era 50 entries de undo separadas.

---

## Decisión

### D1: Split `#replay()` en dos operaciones

```
旧: triggerReplay() → scene sync + render (ambos síncronos)
新: triggerReplay() → #sceneSync() [sync] + #scheduleRender() [async rAF]
```

- `#sceneSync()`: extrae el bloque de decodificación scene→cache. Devuelve `false` si hay error de decode (bug fix: errores de decode ahora se surfacearn).
- `#scheduleRender()`: null-guard sobre `requestAnimationFrame`. Solo llama a `#flushRender()` en el callback del rAF.
- `#flushRender()`: toda la lógica de render (compute viewport, `session.renderPage()`, `innerHTML` swap, viewport apply, state/selection/handles).
- `refreshScene()` ahora delega a `#sceneSync()`.

**One-liner preserve**: `triggerReplay()` sigue siendo `this.#sceneSync(); this.#scheduleRender();` — los ~57 call sites no cambian.

### D2: rAF coalescing

`#scheduleRender()` es idempotente: si `this.#renderPending === true`, no schedulea otro rAF. Múltiples llamadas a `scheduleRender()` antes del siguiente frame se coalescen en un solo `flushRender()`.

### D3: Cancel rAF on detach

`detach()` ahora cancela el rAF pendiente con `cancelAnimationFrame(this.#rafHandle)`, evitando leaks post-detach.

### D4: Paste usa `executeTransaction` directo

`paste()` construye un array de comandos y llama a `session.executeTransaction(commands)` una sola vez. El resultado es **una sola entry de undo** para los N vertices pegados.

```typescript
// Antes: 50 executeTransaction individuales → 50 undo entries
for (const vertex of clipboard.vertices) {
  this.#session.executeTransaction([buildAddVertexCmd(vertex)]);
}

// Después: 1 executeTransaction con 50 comandos → 1 undo entry
const commands = clipboard.vertices.map(v => this.#buildAddVertexFromVertexCmd(v));
this.#session.executeTransaction(commands); // atómico, 1 undo
```

Error handling: `result.ok === false` → `#onError('Paste failed: ' + result.error)` + `return []`.

### D5: Scene sync sigue síncrono

Después de `executeTransaction`, el scene cache está actualizado (el motor WASM committea síncronamente). `#findVertexAt()` busca por posición y encuentra los vertices inmediatamente.

---

## Motivación

### Por qué no async/await

`async/await` habría requerido cambiar la firma de `triggerReplay()` y todos sus ~57 call sites. El split en dos métodos separados preserva la firma original.

### Por qué no FrameBudgetMonitor

`FrameBudgetMonitor` es una tool de diagnóstico (mide FPS, imprime HUD). No debe estar acoplado al render loop. El coalescing es una propiedad del scheduler de rAF, no del monitor.

### Por qué `executeTransaction` directo en paste

`Editor.executeTransaction` (el wrapper público) hace too mucho: commit, replay, error funnel. `Session.executeTransaction` (WASM bridge) es lo que paste necesita: ejecutar comandos y devolver Result. El wrapper `Editor.paste()` gestiona el result directamente.

---

## Consecuencias

### Positivas

- 50 paste ops → 1 render (coalescing)
- Paste undo es una sola operación
- Decode errors en `refreshScene()` ahora se surfacearn (antes eran silenciosos)
- No rAF leak post-detach

### Negativas

- `#replay()` ya no es una sola línea "hace todo" — ahora son 3 métodos
- `triggerReplay()` sigue siendo el shim público, pero el comportamiento interno cambió

---

## Alternatives considered

### A: Async scene sync + async render

Separar scene sync en async también. **Rechazado**: rompería los ~57 call sites que esperan que `triggerReplay()` haya actualizado el scene cache antes de retornar.

### B: FrameBudgetMonitor como scheduler

Usar el monitor para programar renders. **Rechazado**: el monitor es diagnóstico, no lógica de negocio. Mezclar concerns viola ADR-0010 (hexagonal).

### C: Command pattern con batch undo

Crear un nuevo `BatchPasteCommand` que agrupe N `AddVertex` en una sola undo entry. **Rechazado**: `executeTransaction` ya soporta múltiples comandos atómicamente; no necesitamos un nuevo tipo de comando.

---

## Referencias

- ADR-0084: Infinite Canvas con Motor Rust/WASM y Cliente JS Ligero
- ADR-0077: Pragmatic Performance and Draw.io Parity Closure
- `sddk/replay-coalescing/` — SDDK artifacts (spec, design, tasks)
- `feat/replay-coalescing` — branch con 7 commits
