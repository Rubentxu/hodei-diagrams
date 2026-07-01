# Workflows de interacción de usuario draw.io → Hodei

Documento vivo para modelar las interacciones de usuario de draw.io/diagrams.net y usarlas como guía de paridad, gaps y diseño de pruebas en Hodei Diagrams.

> Última actualización: 2026-06-30  
> Alcance: interacciones de usuario con mouse, teclado, táctil, paneles, menús, canvas, shapes, connectors, páginas y capas.  
> Fuente principal: documentación oficial de draw.io/diagrams.net. Ver [Fuentes](#fuentes).

---

## Decisión de modelado

No hay un único estándar universal para documentar interacciones ricas de un editor gráfico. Para este proyecto usamos una combinación pragmática:

1. **Interaction Contract** — contrato compacto por interacción: intención, gesto, estado previo, resultado esperado, estado Hodei, gap y prueba sugerida.
2. **Task/User flows** — agrupación por tareas reales del usuario, no por archivos de código.
3. **Finite-state notes** — cuando el gesto depende de modo/estado: selección, connect mode, text edit, group drill-down, layer lock.
4. **Gherkin/Playwright-ready acceptance** — cada workflow debe poder convertirse a E2E visual o unit/integration test.

### Plantilla canónica

```markdown
### WF-XXX — Nombre del workflow

| Campo | Valor |
|-------|-------|
| Intención | Qué quiere hacer el usuario |
| Gesto draw.io | Mouse / teclado / menú / panel |
| Estado previo | Selección, modo, canvas, capa, página |
| Resultado esperado | Comportamiento observable |
| Estado Hodei | ✅ / 🟨 / ⬜ / ❓ / ⏸ |
| Gap | Qué falta o qué debe verificarse |
| Prueba sugerida | Unit / integration / Playwright / visual |
```

### Leyenda de estado Hodei

| Estado | Significado |
|--------|-------------|
| ✅ | Cubierto por implementación y/o roadmap/test existente |
| 🟨 | Parcial: existe una vía, pero falta fidelidad draw.io o test dedicado |
| ⬜ | Gap funcional probable |
| ❓ | Necesita verificación contra el código/E2E actual |
| ⏸ | Diferido o fuera de alcance consciente |

> Nota: el estado Hodei es una primera clasificación desde `docs/ROADMAP.md` y la evidencia conocida. No reemplaza una auditoría de código ni una ejecución completa de E2E.

---

## Mapa rápido de gaps prioritarios

| Prioridad | Área | Gap probable | Por qué importa |
|-----------|------|--------------|-----------------|
| P0 | Selección avanzada | `Alt+drag`, `Alt+click` z-stack, `Alt+Shift+drag` deselect, `Tab`/`Shift+Tab` cycle | Base de edición profesional en diagramas densos |
| P0 | Connectors | Matriz completa floating/fixed/Alt/Shift/waypoints/labels | La compatibilidad draw.io se juega en edges |
| P0 | Pan/zoom | Space-drag, middle/right drag pan, Home reset, Ctrl/Cmd wheel | Navegación básica en diagramas grandes |
| P1 | Shape library | Double-click canvas chooser, Shift/Alt modifiers, replace shape | Acelera creación; draw.io power-user behavior |
| P1 | Group/container drill-down | Primer click grupo, segundo click child, Alt-click bypass, collapse/expand | Necesario para swimlanes, groups, diagrams complejos |
| P1 | Layers | Add/rename/delete/reorder/hide/lock/move-to-layer | Roadmap dice layers cubierto, pero el workflow completo necesita matriz |
| P2 | Tables/container tables | Row/column shortcuts, table duplicate, resize semantics | Importante para UML/ERD/BPMN, pero puede diferirse |
| P2 | Scratchpad/templates/omnibox | Productividad avanzada | Útil, no bloquea core parity |
| P3 | Collaboration/cloud/mobile | Concurrent editing, storage providers, touch-specific flows | Fuera del core offline engine por ahora |

---

## Catálogo de workflows

### 1. Archivo, sesión, import/export

| ID | Intención | Gesto draw.io | Resultado esperado | Estado Hodei | Gap/test sugerido |
|----|-----------|---------------|--------------------|--------------|-------------------|
| FILE-001 | Crear diagrama nuevo | File > New / start screen | Nuevo archivo con una página inicial | 🟨 | Hodei tiene canvas inicial; verificar flujo explícito New |
| FILE-002 | Abrir `.drawio` | File > Open / toolbar Open / file input | Importa XML y renderiza páginas | ✅ | Ya hay fixtures y diagnóstico clean/error |
| FILE-003 | Drag & drop archivo en canvas | Arrastrar `.drawio` al canvas | Importa o inserta según contexto | ❓ | Probar drop file en canvas |
| FILE-004 | Abrir archivo en nueva pestaña | `Shift` + drag file sobre canvas | draw.io abre en nueva tab del browser | ⏸ | Multi-tab no aplica todavía; documentar defer |
| FILE-005 | Guardar `.drawio` | File > Save / toolbar Save | Descarga o persiste XML compatible | ✅ | Verificar round-trip con golden fixture |
| FILE-006 | Exportar visual | File > Export SVG/PNG/PDF/HTML | Genera export según formato | 🟨 | SVG wired; PNG/PDF/HTML revisar contra menú actual |
| FILE-007 | Import failure visible | Abrir fixture inválido | Error visible + estado diagnóstico error | ✅ | Ya validado: pill `Import failed` |
| FILE-008 | Estado compatible visible | Abrir fixture válido | Pill `.drawio compatible` / no issues | ✅ | Ya validado con `simple-rect.drawio` |
| FILE-009 | Undo/redo global | `Ctrl+Z`, `Ctrl+Shift+Z`, toolbar | Estado y render se sincronizan | ✅ | Roadmap ciclos 10–11/16 cubren bugs relevantes |
| FILE-010 | Autosave/status | Estado visual saved/dirty/autosave | Usuario entiende persistencia | 🟨 | Hodei muestra saved; no cloud autosave |

### 2. Navegación de canvas: pan, scroll, zoom

| ID | Intención | Gesto draw.io | Resultado esperado | Estado Hodei | Gap/test sugerido |
|----|-----------|---------------|--------------------|--------------|-------------------|
| NAV-001 | Pan vertical/horizontal | Scrollbars | Viewport se desplaza sin modificar diagrama | ⏸ | Deferred: transform-pan architecture; DOM scrollbars non-authoritative |
| NAV-002 | Pan con rueda | Mouse wheel | Scroll vertical | ⏸ | Deferred: same transform-pan architectural reason as NAV-001 |
| NAV-003 | Pan horizontal | `Shift` + wheel | Scroll horizontal | ✅ | `navigation-modifiers.spec.ts::NAV-003` (PR #154) |
| NAV-004 | Pan drag | Right-click drag / middle-click drag | Canvas se arrastra | ✅ | `navigation-modifiers.spec.ts::NAV-004a/NAV-004b` (PR #154) |
| NAV-005 | Pan con Space | `Space` + drag | Modo mano temporal | ✅ | `navigation-modifiers.spec.ts::NAV-005` (PR #154) |
| NAV-006 | Pan teclado | Arrow keys sin selección | Mueve viewport | ✅ | Arrow-key pan via merged switch in `#onKeyDown` (PR #154) |
| NAV-007 | Reset view | `Home` / View > Reset View | Vuelve a vista inicial | ✅ | `navigation-modifiers.spec.ts::NAV-007` (PR #154) |
| NAV-008 | Zoom toolbar | Click zoom in/out o dropdown | Zoom cambia y HUD/toolbar actualiza | ✅ | Zoom shortcuts v0.56; verificar toolbar completo |
| NAV-009 | Zoom mouse | `Ctrl/Cmd` + wheel o `Alt` wheel | Zoom centrado cerca del cursor | ✅ | `navigation-modifiers.spec.ts::NAV-009` (PR #154) |
| NAV-010 | Zoom teclado | `Ctrl/Cmd` + `+/-` numpad | Zoom in/out | ✅ | Roadmap v0.56; ampliar con numpad |
| NAV-011 | Touch zoom | Pinch canvas | Zoom táctil | ⏸ | Mobile/touch fuera de foco actual |
| NAV-012 | Outline navigation | View > Outline / `Ctrl+Shift+O` | Panel outline permite navegar | ⏸ | Deferred: Outline panel is P1 feature, out of P0 canvas-nav scope |

### 3. Shape library, inserción y búsqueda

| ID | Intención | Gesto draw.io | Resultado esperado | Estado Hodei | Gap/test sugerido |
|----|-----------|---------------|--------------------|--------------|-------------------|
| SHAPE-001 | Insertar shape básico | Click en shape library | Shape aparece en canvas | ✅ | Cubierto por editor + E2E existentes |
| SHAPE-002 | Drag shape al canvas | Drag desde sidebar al canvas | Shape se inserta en drop position | 🟨 | Confirmar drag real, no solo click |
| SHAPE-003 | Buscar shape | Escribir en search field | Filtra shapes/libraries | ✅ | v0.54 search; mantener test |
| SHAPE-004 | More Shapes | Click More Shapes | Lista de librerías/categorías | 🟨 | Hodei muestra categorías placeholder + file load |
| SHAPE-005 | Cargar stencil custom | Load stencils from file | Nueva biblioteca disponible | ✅ | PR #96; verificar flujo UI actual |
| SHAPE-006 | Double-click canvas | Doble click zona vacía | Selector rápido de shapes/texto | ⬜ | Gap probable importante |
| SHAPE-007 | Direction arrow selector | Hover shape → click direction arrow | Selector rápido similar | 🟨 | Hodei tiene connect handles; selector rápido no confirmado |
| SHAPE-008 | Ignorar default style | `Shift` + click/drag shape library | Inserta con estilo default blanco/negro | ⬜ | Gap power-user |
| SHAPE-009 | Insertar bottom-left | `Alt` + click shape library | Inserta debajo/abajo izquierda del diagrama | ⬜ | Gap power-user |
| SHAPE-010 | Reemplazar shape | Seleccionar shape + `Shift` click shape library | Cambia tipo manteniendo dimensiones | ⬜ | Gap probable |
| SHAPE-011 | Insertar y conectar | Shape seleccionado + `Alt+Shift`/`Alt+Ctrl` click library | Nueva shape conectada | ⬜ | Gap probable |
| SHAPE-012 | Attach shape a connector | Seleccionar connector loose end + click library | Shape se conecta al extremo | ⬜ | Gap probable |
| SHAPE-013 | Drop shape sobre direction arrow | Drag library sobre arrow de shape | Inserta y conecta | 🟨 | Conectores existen; workflow de drop necesita test |
| SHAPE-014 | Scratchpad | Guardar shapes favoritos | Reusar fragmentos | ⬜ | Fuera de core actual |
| SHAPE-015 | Omnibox | Buscar comando/shape/help | Ejecuta búsqueda/acciones | ⬜ | Productividad avanzada |

### 4. Selección, multi-selección y z-order picking

| ID | Intención | Gesto draw.io | Resultado esperado | Estado Hodei | Gap/test sugerido |
|----|-----------|---------------|--------------------|--------------|-------------------|
| SEL-001 | Seleccionar shape/connector | Click | Elemento queda seleccionado; inspector cambia | ✅ | Básico cubierto |
| SEL-002 | Seleccionar múltiples | `Shift` click / `Ctrl` click | Toggle selección | ✅ | Multi-selection existe; verificar modifiers |
| SEL-003 | Selection box containment | Drag box | Selecciona elementos completamente dentro | ✅ | Cubierto por selección box si existe; confirmar |
| SEL-004 | Forzar selection box | `Alt` + drag | Ignora handles y fuerza caja | ⬜ | Gap probable |
| SEL-005 | Seleccionar intersección | Terminar drag con `Alt` | Incluye elementos parcialmente dentro | ⬜ | Gap probable |
| SEL-006 | Deselect por box | `Alt+Shift` + drag | Quita elementos de selección | ⬜ | Gap probable |
| SEL-007 | Toggle deselect | `Shift`/`Ctrl` click selected | Deselecciona elemento | ✅ | Verificar edge cases |
| SEL-008 | Select all | `Ctrl+A` | Selecciona todo | ✅ | Roadmap v0.65+ Select All |
| SEL-009 | Select connectors only | `Ctrl+E` Windows | Selecciona conectores | ⬜ | Gap probable |
| SEL-010 | Select shapes only | `Ctrl+I` Windows | Selecciona shapes/text labels | ⬜ | Gap probable |
| SEL-011 | Deselect all | `Ctrl+Shift+A` | Limpia selección | ❓ | Probar |
| SEL-012 | Cycle next/previous | `Tab` / `Shift+Tab` | Selecciona siguiente/anterior incluyendo containers/labels | ⬜ | Gap importante para teclado |
| SEL-013 | Select parent/container | `Alt+Tab` | Sube al parent | ⬜ | Requiere parent model robusto |
| SEL-014 | Select underneath | `Alt` + click stacked | Selecciona siguiente en z-stack | ⬜ | Gap probable |
| SEL-015 | Selection inside group | Click group, segundo click child | Drill-down | 🟨 | Group existe; drill-down necesita matriz |
| SEL-016 | Bypass group parent | `Alt` click child | Selecciona topmost child | ⬜ | Gap probable |

### 5. Movimiento, resize, rotación y alineación

| ID | Intención | Gesto draw.io | Resultado esperado | Estado Hodei | Gap/test sugerido |
|----|-----------|---------------|--------------------|--------------|-------------------|
| MOVE-001 | Mover shape | Drag selección | Cambia geometría y conectores siguen | ✅ | Core editor |
| MOVE-002 | Nudge | Arrow keys con selección | Mueve selección | ✅ | v0.55 |
| MOVE-003 | Grid nudge | `Shift+Arrow` | Mueve por incrementos de grid | 🟨 | Roadmap nudge; grid increment confirmar |
| MOVE-004 | Ignore grid/guides | `Alt` + move/resize | Movimiento suave sin snap | ⬜ | Gap probable |
| MOVE-005 | Snap to grid | Drag cerca de grid | Snap activo si grid enabled | ✅ | Snap existe; verificar toggles |
| MOVE-006 | Alignment guides | Drag cerca de otros shapes | Guías azules/naranjas | 🟨 | Snap/align existe; guía visual confirmar |
| MOVE-007 | Align selected | Arrange > Align | Alinea edges/centers | ✅ | Align tests existen |
| MOVE-008 | Distribute selected | Arrange > Distribute | Espaciado uniforme | ✅ | Distribute tests existen |
| MOVE-009 | Resize handles | Drag handles | Cambia size | ✅ | Core editor |
| MOVE-010 | Proportional resize | `Shift` + resize | Mantiene ratio | ⬜ | Gap probable |
| MOVE-011 | Group outer resize | `Ctrl` + resize group | Redimensiona contorno, no children | ⬜ | Gap avanzado |
| MOVE-012 | Centered group resize | `Alt` + resize group | Redimensiona alrededor del centro | ⬜ | Gap avanzado |
| MOVE-013 | Keyboard resize | `Ctrl+Shift+Arrow` | Cambia width/height | ⬜ | Gap probable |
| MOVE-014 | Rotate | Drag rotate handle | Rota shape/group | ✅ | Rotate/flip roadmap cubierto |
| MOVE-015 | Flip | Arrange / toolbar | Flip horizontal/vertical | ✅ | Roadmap cubierto |
| MOVE-016 | Insert space/move area | `Alt+Ctrl+Shift` + drag blank area | Desplaza área y shapes cercanos | ⬜ | Gap avanzado pero útil en diagramas grandes |

### 6. Connectors, ports, waypoints y labels

| ID | Intención | Gesto draw.io | Resultado esperado | Estado Hodei | Gap/test sugerido |
|----|-----------|---------------|--------------------|--------------|-------------------|
| EDGE-001 | Crear connector flotante | Hover source → drag direction arrow → drop target outline azul | Edge se conecta al perímetro dinámico | ✅ | Cycle 7 bugfix + arrows |
| EDGE-002 | Crear connector fijo | Drag fixed point → drop fixed point verde | Edge se ancla a punto fijo | ✅ | Connection points Phase A/B; test port handles |
| EDGE-003 | Connect anywhere fixed | `Alt` + drag connector sobre shape | Se fija en cualquier posición del shape | 🟨 | Ports existen; modifier any-position necesita test |
| EDGE-004 | Fixed-points-only | `Shift` + drag connector end sobre shape | Solo muestra fixed points | ⬜ | Gap modifier probable |
| EDGE-005 | Ignore shape on connect | `Alt` + drag/drop connector end sobre shape | Solapa sin conectar | ⬜ | Gap probable |
| EDGE-006 | Quick adjacent connect | Click direction arrow hacia shape existente | Conecta sin clonar | ✅ | Cycle 7 cubre click-to-connect |
| EDGE-007 | Clone/connect via arrow | Click direction arrow y elegir clone | Clona shape y conecta | 🟨 | Clone/connect keyboard existe? verificar UI picker |
| EDGE-008 | Clone/connect keyboard | `Alt+Shift+Arrow` | Clona/conecta en dirección | ⬜ | Gap probable |
| EDGE-009 | Clone drag | `Ctrl` + drag shape/connector | Duplica selección | ✅ | Ctrl+D existe; Ctrl-drag confirmar |
| EDGE-010 | Route all edges | Menu Re-route Edges | Recalcula rutas y reporta errores | ✅ | Cycle 14 error propagation |
| EDGE-011 | Add waypoint drag | Drag connector segment/blue handle | Añade waypoint inteligente | ✅ | Bend editing v0.58/edge routing |
| EDGE-012 | Add waypoint context menu | Right-click segment > Add Waypoint | Inserta waypoint | 🟨 | Context menu existe; item específico verificar |
| EDGE-013 | Remove waypoint drag | Drag segment back | Elimina waypoint automáticamente | ✅ | Bend editing parcial |
| EDGE-014 | Remove waypoint context | Right-click waypoint > Remove | Elimina waypoint | 🟨 | Verificar context item |
| EDGE-015 | Clear waypoints | Context > Clear Waypoints / `Alt+Shift+R` | Edge vuelve a ruta shortest/default | 🟨 | Menu quizá; shortcut no confirmado |
| EDGE-016 | Straight/orthogonal/curved | Style > Waypoints/path style | Cambia tipo de ruta | ✅ | Curved + orthogonal cubierto; UI style verificar |
| EDGE-017 | Arrowheads | Style/toolbar arrowheads | Start/end arrows se actualizan | ✅ | v0.45 + E2E |
| EDGE-018 | Reverse connector | Arrange tab/menu | Source/target y labels extremos se intercambian | 🟨 | Reverse no claro en roadmap |
| EDGE-019 | Flip connector | Arrange tab/menu | Waypoints pueden cambiar/eliminarse | 🟨 | Flip existe para shapes; connector flip verificar |
| EDGE-020 | Connector label center/end | Double-click connector location | Añade label central/source/target | ✅ | Edge label editing v0.46 |
| EDGE-021 | Drag connector label | Drag diamond handle | Reposiciona label | ✅ | v0.53; drag-to-reposition deferred antes, revisar estado final |
| EDGE-022 | Line jumps | Style connector overlap | Renderiza saltos al cruzar | ⬜ | Gap probable |
| EDGE-023 | Join connectors | Waypoint shape en Misc | Dos edges se organizan por waypoint shape | 🟨 | Waypoint shape/stencil depende de shape library |

### 7. Texto y labels

| ID | Intención | Gesto draw.io | Resultado esperado | Estado Hodei | Gap/test sugerido |
|----|-----------|---------------|--------------------|--------------|-------------------|
| TEXT-001 | Editar label shape | Double-click shape / `F2` | Editor inline aparece | ✅ | Text editing roadmap cubierto |
| TEXT-002 | Editar label connector | Double-click connector | Editor inline aparece | ✅ | v0.46 |
| TEXT-003 | Crear text shape | Text tool / double-click canvas selector | Text object aparece | ✅ | Text tool existe; double-click selector gap |
| TEXT-004 | Bold/italic | Toolbar/inspector | Estilo de texto cambia | ✅ | Toolbar actual tiene botones |
| TEXT-005 | Font size keyboard | `Ctrl+Shift +/-` numpad | Cambia font size label completo | ⬜ | Gap probable |
| TEXT-006 | Text alignment/spacing | Text tab format panel | Label cambia posición/alineación | 🟨 | Inspector parcial; matriz pendiente |
| TEXT-007 | Math typesetting | Extras > Mathematical Typesetting | KaTeX/Math mode renderiza | ✅ | v0.65 |
| TEXT-008 | Rich text portions | Seleccionar parte del texto | Cambia solo fragmento | ❓ | Verificar si label editor soporta rich ranges |

### 8. Estilos, formato e inspector

| ID | Intención | Gesto draw.io | Resultado esperado | Estado Hodei | Gap/test sugerido |
|----|-----------|---------------|--------------------|--------------|-------------------|
| STYLE-001 | Cambiar fill/stroke | Toolbar/Style tab | Shape cambia colores | ✅ | Inspector + session tests |
| STYLE-002 | Cambiar connector style | Style tab/toolbar | Edge cambia color, width, pattern, arrows | ✅ | Arrowheads + style partial; width/pattern verificar |
| STYLE-003 | Set default style | Style tab / `Ctrl+Shift+D` | Nuevos shapes usan estilo seleccionado | ⬜ | Gap probable |
| STYLE-004 | Clear default style | Nada seleccionado + `Ctrl+Shift+R` | Default vuelve blanco/negro | ⬜ | Gap probable |
| STYLE-005 | Copy style | `Alt+C` | Style copiado | ⬜ | Gap probable |
| STYLE-006 | Paste style | `Alt+V` | Style aplicado a selección | ⬜ | Gap probable |
| STYLE-007 | Edit raw style | `Ctrl+E` / Edit Style | Dialog raw style key/value | 🟨 | Edit XML existe; raw cell style no confirmado |
| STYLE-008 | Format panel toggle | View > Format Panel / `Ctrl+Shift+P` | Inspector aparece/desaparece | 🟨 | Mobile inspector toggle existe; shortcut/menu verificar |
| STYLE-009 | Diagram options | Nada seleccionado: grid/page/background/guides | Modifica opciones de página | 🟨 | Page background existe; grid/guides/page size revisar |
| STYLE-010 | Dark/light/global style | Style tab diagram | Cambia esquema global | ⬜ | Gap probable |

### 9. Menús, comandos y acciones destructivas

| ID | Intención | Gesto draw.io | Resultado esperado | Estado Hodei | Gap/test sugerido |
|----|-----------|---------------|--------------------|--------------|-------------------|
| CMD-001 | Menús contextuales por selección | Right-click shape/edge/canvas | Acciones contextuales adecuadas | ✅ | Context menu v0.51; matriz por target pendiente |
| CMD-002 | Delete selected | `Delete` / `Backspace` | Borra selected; conexiones según semántica normal | ✅ | Delete button/keyboard |
| CMD-003 | Delete with connections | `Shift` + toolbar trash | Borra shape y conexiones | ⬜ | Gap draw.io-specific |
| CMD-004 | Copy/paste/cut | `Ctrl+C/V/X` | Duplicación con ids nuevos | ✅ | Duplicación existe; cut/copy matrix revisar |
| CMD-005 | Duplicate | `Ctrl+D` | Duplica selección offset | ✅ | v0.55 |
| CMD-006 | Bring to front/back | Toolbar/menu | Cambia z-order | ✅ | Layers/z-order cycles |
| CMD-007 | Bring forward/backward | Menu/Arrange | Cambia un paso | ✅ | Verificar exactitud step-wise |
| CMD-008 | Help shortcuts | Help > Keyboard Shortcuts | Muestra atajos | 🟨 | Menu Help existe; dialog verificar |
| CMD-009 | Unsupported menu honesty | Acción no soportada | Deshabilitada o error claro | ✅ | v0.77 P3 |

### 10. Groups, containers, swimlanes y locking

| ID | Intención | Gesto draw.io | Resultado esperado | Estado Hodei | Gap/test sugerido |
|----|-----------|---------------|--------------------|--------------|-------------------|
| GROUP-001 | Group | Selección múltiple + `Ctrl+G` / Arrange > Group | Grupo nuevo | ✅ | v0.44 |
| GROUP-002 | Ungroup | Grupo + `Ctrl+Shift+U` | Children vuelven al parent | ✅ | v0.44 |
| GROUP-003 | Mover grupo | Drag grupo | Mueve children juntos | ✅ | Group rendering/commands |
| GROUP-004 | Resize group recursive | Drag handles | Children escalan relativo | 🟨 | Verificar fidelity |
| GROUP-005 | Rotate group | Rotate handle | Children rotan alrededor centro | 🟨 | Rotate existe; group rotate revisar |
| GROUP-006 | Add child to group | Drag cell over group green outline | Child pasa a group | 🟨 | Group parent existe; drop UI verificar |
| GROUP-007 | Remove from group | Drag fuera / Arrange > Remove from Group | Child sale del group | 🟨 | Verificar menu/drag |
| GROUP-008 | Collapse/expand | Click `-/+` fold icon | Foldable cambia bounds/visibilidad | ⬜ | Gap probable |
| GROUP-009 | Collapse modifiers | `Shift`/`Alt` click fold icon | Resize siblings / no resize stack | ⬜ | Gap avanzado |
| GROUP-010 | Collapse keyboard | `Ctrl+Home` / `Ctrl+End` | Collapse/expand selected | ⬜ | Gap avanzado |
| GROUP-011 | Lock cell | `Ctrl+L` / Edit > Lock | No se puede seleccionar/mover/editar | 🟨 | Locked/hidden fixture existe; UI lock verificar |
| GROUP-012 | lockedGroup | Click child selecciona group como unidad | ⬜ | Gap group fidelity |
| GROUP-013 | transparentBounds | Group bounds derivado de children | ⬜ | Gap avanzado |
| GROUP-014 | Per-cell icons | edit/move/connect/lock icons | Iconos interactivos por style key | ⬜ | Gap avanzado |
| GROUP-015 | Swimlanes | Insertar/mover children en swimlane | Header y parent semantics | ✅ | PR #92; workflows detallados pendientes |

### 11. Layers

| ID | Intención | Gesto draw.io | Resultado esperado | Estado Hodei | Gap/test sugerido |
|----|-----------|---------------|--------------------|--------------|-------------------|
| LAYER-001 | Abrir layers | View > Layers / `Ctrl+Shift+L` | Dialog/panel visible | ✅ | Layers panel existe según roadmap; shortcut verificar |
| LAYER-002 | Add layer | Layers dialog + | Nueva capa seleccionable | ✅ | UI matrix |
| LAYER-003 | Duplicate layer | Dialog action | Copia layer | ❓ | Verificar |
| LAYER-004 | Rename layer | Dialog/context | Nombre cambia | ✅ | Verificar |
| LAYER-005 | Delete layer | Dialog trash | Capa eliminada según reglas | ✅ | Verificar |
| LAYER-006 | Reorder layers | Drag/order buttons | Z-order entre layers cambia | ✅ | Verificar |
| LAYER-007 | Hide/display layer | Eye toggle | Shapes layer se ocultan/muestran | ✅ | Verificar |
| LAYER-008 | Lock/unlock layer | Lock toggle | Shapes no editables | ✅ | Verificar |
| LAYER-009 | Move selected to layer | Dialog/menu | Selection cambia de layer | ✅ | PR #165 (feat/ip-f-layer-web-shell) web-shell layers panel implements move-to-layer workflow |
| LAYER-010 | Select all objects on layer | Dialog action | Selection layer completa | ⬜ | Gap probable |
| LAYER-011 | Cross-layer connectors | Connector entre layers | Edge conecta shapes de capas distintas | ❓ | Test fixture necesario |

### 12. Páginas múltiples

| ID | Intención | Gesto draw.io | Resultado esperado | Estado Hodei | Gap/test sugerido |
|----|-----------|---------------|--------------------|--------------|-------------------|
| PAGE-001 | Añadir página | `+` tab bottom | Nueva página activa | ✅ | v0.47 |
| PAGE-002 | Renombrar página | Right-click tab > Rename | Nombre cambia y links actualizan | ✅ | v0.47; links update verificar |
| PAGE-003 | Eliminar página | Right-click tab > Delete | Página eliminada; undo funciona | ✅ | v0.47 |
| PAGE-004 | Duplicar página | Right-click tab > Duplicate | Página duplicada con contents | 🟨 | Verificar |
| PAGE-005 | Reordenar páginas | Drag page tabs | Orden cambia | 🟨 | Verificar |
| PAGE-006 | Cambiar página | Click tab | Canvas/render cambia | ✅ | Page-tab refresh bug fixed v0.81 |
| PAGE-007 | Link shape to page | Context > Edit Link > page | Click navega a página | ⬜ | Gap probable |
| PAGE-008 | Page as background | Format panel background page | Usa otra página de fondo | ⬜ | Gap avanzado |
| PAGE-009 | Print multipage PDF | File > Print | PDF multipágina | ⏸ | Export/print externo |

### 13. Tables y contenedores tabulares

| ID | Intención | Gesto draw.io | Resultado esperado | Estado Hodei | Gap/test sugerido |
|----|-----------|---------------|--------------------|--------------|-------------------|
| TABLE-001 | Insertar table/container table | Shape library table | Tabla renderiza y acepta cells | ⬜ | Gap probable |
| TABLE-002 | Resize row/column | Drag border | Cambia row/column | ⬜ | Gap advanced shape |
| TABLE-003 | Resize modifiers | `Shift`/`Ctrl`/`Shift+Ctrl` + border drag | Move border / equalize / distribute | ⬜ | Gap advanced |
| TABLE-004 | Move row/column | Select row/column + drag | Reordena | ⬜ | Gap advanced |
| TABLE-005 | Duplicate row | `Enter` on row/cell | Duplica fila | ⬜ | Gap advanced |
| TABLE-006 | Duplicate table | `Ctrl+Enter` | Duplica table completa | ⬜ | Gap advanced |
| TABLE-007 | Delete row/column | `Delete` | Elimina row/column | ⬜ | Gap advanced |
| TABLE-008 | Overlay on table cell | `Alt` + drop shape | Solapa sin contener | ⬜ | Gap advanced |

### 14. Import, insert, imágenes, links, tooltips, tags

| ID | Intención | Gesto draw.io | Resultado esperado | Estado Hodei | Gap/test sugerido |
|----|-----------|---------------|--------------------|--------------|-------------------|
| INS-001 | Insertar imagen | Arrange/Insert/Image or drag image | ShapeKind::Image/render SVG | ✅ | PR #93 |
| INS-002 | Importar XML/edit XML | Extras > Edit Diagram/XML | Usuario edita XML | ✅ | PR #111 |
| INS-003 | Link shape | Context > Edit Link | Click/tooltip navega o abre URL/page | ⬜ | Gap probable |
| INS-004 | Tooltip | Context/metadata | Tooltip visible en hover | ⬜ | Gap probable |
| INS-005 | Tags | Extras/tags | Filtrar/gestionar tags | ⬜ | Gap probable |
| INS-006 | Mermaid import | Arrange/Insert Mermaid | Genera diagrama | ⏸ | Fuera del semantic port inicial |
| INS-007 | Generate diagram | Prompt/generator | Genera desde texto | ⏸ | AI/deferred |
| INS-008 | Templates | New/template library | Crea desde template | ⬜ | Gap UX/productividad |

### 15. Mobile/touch/accessibility/collaboration

| ID | Intención | Gesto draw.io | Resultado esperado | Estado Hodei | Gap/test sugerido |
|----|-----------|---------------|--------------------|--------------|-------------------|
| MOB-001 | Pan táctil | Tap+drag blank canvas | Canvas se mueve | ⏸ | Touch específico diferido |
| MOB-002 | Pinch zoom | Dos dedos | Zoom cambia | ⏸ | Touch específico diferido |
| MOB-003 | Responsive editor | Narrow viewport | Canvas-first, panel toggle | ✅ | Impeccable pass 2026-06-30 |
| A11Y-001 | Keyboard focus visible | Tab navigation | Focus ring claro | ✅ | Impeccable pass 2026-06-30 |
| A11Y-002 | Keyboard-only editing | No mouse | Crear/seleccionar/mover/conectar básico | 🟨 | Falta matriz completa de shortcuts |
| COLLAB-001 | Concurrent editing | Multi-user cloud | Edits en tiempo real | ⏸ | Deferred ADR-0048 |
| COLLAB-002 | Storage providers | Google/OneDrive/GitHub/etc | Abrir/guardar remoto | ⏸ | Core local-first actual |

---

## Backlog recomendado derivado

### P0 — Paridad de interacción núcleo

1. **Selection Modifier Matrix**
   - `Alt+drag` force box
   - `Alt` end selection box includes intersecting shapes
   - `Alt+Shift+drag` deselect box
   - `Alt+click` select underneath
   - `Tab`, `Shift+Tab`, `Alt+Tab` selection cycling

2. **Connector Modifier Matrix**
   - Floating vs fixed connector visual feedback
   - `Shift` fixed-point-only connect
   - `Alt` ignore shape on connect / connect anywhere fixed
   - `Alt+Shift+R` clear waypoints
   - Context menu add/remove/clear waypoint

3. **Canvas Navigation Matrix**
   - Space-drag pan
   - Middle/right drag pan
   - `Shift+wheel` horizontal scroll
   - `Ctrl/Cmd`/`Alt` wheel zoom
   - `Home` reset view

### P1 — Productividad draw.io

1. Double-click canvas shape selector.
2. Shape library modifiers: `Shift`, `Alt`, `Alt+Shift`, replace selected shape.
3. Style shortcuts: `Alt+C`, `Alt+V`, `Ctrl+Shift+D`, `Ctrl+Shift+R`, `Ctrl+E`.
4. Group drill-down/collapse semantics.
5. Page duplicate/reorder and layer move/select-all matrix.

### P2 — Diagramas complejos

1. Tables/container tables.
2. Links/tooltips/tags.
3. Scratchpad/templates/omnibox.
4. Line jumps and advanced connector style properties.

### P3 — Diferido explícito

1. Cloud storage providers.
2. Concurrent editing/CRDT.
3. Mobile/touch-first editor parity.
4. AI/generate diagram workflows.

---

## Cómo convertir esto en pruebas

Para cada workflow:

1. **Unit/integration Rust** cuando el resultado es modelo puro: commands, geometry, pages, layers, edge endpoints.
2. **WASM boundary tests** cuando el resultado cruza JS↔Rust: command batch, import/export, render scene/SVG.
3. **Playwright E2E** cuando el gesto importa: mouse modifiers, keyboard shortcuts, focus, panel visibility.
4. **Visual evidence** cuando el resultado es geométrico: waypoints, connectors, labels, layers, responsive layout.

Formato sugerido de test ID:

```text
<area>-<workflow-id>-<short-name>

examples:
selection-sel-004-alt-force-selection-box
connectors-edge-004-shift-fixed-point-only
navigation-nav-005-space-drag-pan
```

Acceptance example:

```gherkin
Scenario: Alt-drag forces a selection box over shape handles
  Given a diagram with one selected shape and visible resize handles
  When the user holds Alt and drags from inside the selected shape bounds
  Then the editor draws a selection rectangle instead of resizing or rotating
  And the final selection contains only shapes intersecting that rectangle according to draw.io semantics
```

---

## Auditoría de cobertura (2026-06-30)

Tres audits en paralelo (E2E specs, implementación web-shell, Rust/unit tests) revelaron el estado real de cada área. Referencias: ADR-0079 (estrategia), ADR-0080 (atajos), ADR-0081 (layers).

### Conflictos de binding descubiertos

| Atajo | draw.io | Hodei hoy | Resolución (ADR-0080) |
|-------|---------|-----------|----------------------|
| `Ctrl+G` | Group | Grid toggle | **Group** (grid via View menu) |
| `Ctrl+Shift+U` | Ungroup | (unbound) | **Ungroup** |
| `Ctrl+Shift+P` | Format Panel toggle | Presentation mode | **Presentation** (Hodei no tiene format panel colapsable; inspector always-on) |
| `Ctrl+Shift+G` | — | Snap toggle | **Snap** (sin cambio; no colisiona) |

### Gap de motor confirmado

| Área | Estado del engine | Acción |
|------|-------------------|--------|
| **Layers** | No existe `Layer` struct. El "layers-z-order" del ROADMAP es solo z-order. | Deferred (ADR-0081, ciclo IP-F) |
| **Reverse/Flip edge** | `FlipCommand` es vertex-only | Ciclo IP-E |
| **Duplicate/Reorder page** | Sin `DuplicatePage`, sin order index en `Page` | Ciclo IP-E |
| **Group collapse/expand** | Sin campo `collapsed`/`foldable` en `Group` | Post-IP-F |
| **Default style** | Sin concepto en engine | Ciclo IP-E |
| **Tables** | Sin modelo alguno | Deferred (P2) |

### Cobertura E2E por área (resumen)

| Área | Workflows cubiertos | Parciales | Gaps totales |
|------|--------------------|-----------|------------- 
| 1. File/session | 5/10 | 3 | 2 (drag-drop file, multi-tab) |
| 2. Canvas nav | 2/12 | 3 | 7 (Space-drag, Home, Shift-wheel, Ctrl-wheel, Outline) |
| 3. Shape library | 2/15 | 3 | 10 (double-click chooser, Shift/Alt modifiers, replace, insert+connect) |
| 4. Selection | 3/16 | 4 | 9 (Alt+drag, Alt+click, Tab cycle, Ctrl+E/I, drill-down) |
| 5. Move/resize | 7/16 | 1 | 8 (Shift nudge, Alt ignore-grid, Shift proportional, Ctrl+Shift+arrow) |
| 6. Connectors | 4/23 | 5 | 14 (Shift fixed-point, Alt connect-anywhere, Alt+Shift+R, reverse, flip, label drag) |
| 7. Text/labels | 3/8 | 1 | 4 (text chooser, Ctrl+Shift numpad, rich portions) |
| 8. Style | 1/10 | 3 | 6 (Alt+C/V, Ctrl+Shift+D/R, Ctrl+E, default style, diagram options) |
| 9. Menus/cmds | 5/9 | 2 | 2 (context menu shape/edge, Shift+Delete) |
| 10. Groups | 0/15 | 2 | 13 (keyboard, drill-down, collapse, lock, swimlane workflows) |
| 11. Layers | 0/11 | 1 | 10 (toda el área — sin modelo Layer en engine) |
| 12. Pages | 3/9 | 0 | 6 (rename menu, duplicate, reorder, link-to-page, background) |
| 13. Tables | 0/8 | 0 | 8 (toda el área) |
| 14. Import/ins | 1/8 | 0 | 7 (links, tooltips, tags, templates) |
| 15. Mob/a11y | 2/7 | 1 | 4 (touch, full keyboard matrix, collab) |

**Total: ~38 workflows cubiertos, ~27 parciales, ~100 gaps** sobre ~165 workflows catalogados.

### Hallazgos estructurales adicionales

1. **Context menu** se testea solo en canvas vacío — nunca en shape o edge (necesario para EDGE-012/014/015, CMD-001, INS-003/004).
2. **Bend/waypoint** existe solo como test de error de API en `error-path.spec.ts` — nunca como gesto drag o right-click.
3. **Middle-drag pan** funciona pero solo 1 test; right-drag pan no se testea.
4. **Wheel** siempre hace zoom en Hodei; draw.io distingue wheel=pan vs Ctrl+wheel=zoom.
5. **Multi-select drag** solo commitea el vertex arrastrado, no toda la selección — bug de implementación.
6. **`Ctrl+Shift+P`** está bindeado a Presentation, no a Format Panel — discrepancia con draw.io que se documenta como decisión consciente (ADR-0080).

---

## Fuentes

Oficiales draw.io/diagrams.net consultadas el 2026-06-30:

- Keyboard shortcuts: https://www.drawio.com/docs/reference/shortcuts/
- Mouse + keyboard shortcuts: https://www.drawio.com/docs/reference/shortcuts/modifier-shortcuts-in-diagrams/
- Select shapes/connectors: https://www.drawio.com/docs/reference/shortcuts/shortcut-select/
- Deselect shapes: https://www.drawio.com/docs/reference/shortcuts/shortcut-deselect-shapes/
- Double click to add shape: https://www.drawio.com/docs/reference/shortcuts/double-click-shortcut/
- Clone/connect shortcuts: https://www.drawio.com/docs/reference/shortcuts/shortcut-clone-connect/
- Shape library shortcuts: https://www.drawio.com/docs/reference/shortcuts/shortcut-shape-library/
- Style shortcuts: https://www.drawio.com/docs/reference/shortcuts/shortcut-styles/
- Clear connector waypoints: https://www.drawio.com/docs/reference/shortcuts/clear-waypoints/
- Delete shapes with connections: https://www.drawio.com/docs/reference/shortcuts/shortcut-shift-delete/
- Font size shortcuts: https://www.drawio.com/docs/reference/shortcuts/increase-decrease-font-size/
- Shape size shortcuts: https://www.drawio.com/docs/reference/shortcuts/increase-decrease-shape-size/
- Table shortcuts: https://www.drawio.com/docs/reference/shortcuts/table-shortcuts/
- Connectors manual: https://www.drawio.com/docs/manual/connectors/
- Connect shapes quickly: https://www.drawio.com/docs/manual/connectors/connect-shapes/
- Connector waypoints: https://www.drawio.com/docs/manual/connectors/waypoints-connectors/
- Format panel: https://www.drawio.com/docs/manual/editor/panels/format-panel/
- Shapes panel: https://www.drawio.com/docs/manual/editor/panels/shapes-panel/
- Menus: https://www.drawio.com/docs/manual/editor/menus/
- Alignment tools: https://www.drawio.com/docs/manual/editor/alignment-tools/
- Pan and scroll: https://www.drawio.com/docs/manual/editor/pan-scroll/
- Zoom: https://www.drawio.com/docs/manual/editor/zoom/
- Layers: https://www.drawio.com/docs/manual/layers/
- Multi-page diagrams: https://www.drawio.com/docs/manual/pages/
- Group/ungroup: https://www.drawio.com/docs/manual/editor/group-shapes-connectors/
