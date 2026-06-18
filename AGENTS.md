# Hodei Diagrams — AGENTS.md

## 1. Proyecto

**Hodei Diagrams** es una plataforma de diagramación cuyo núcleo es un **motor reutilizable** en Rust
(Semantic Port de draw.io/diagrams.net con compatibilidad `.drawio`). El editor visual,
la compatibilidad `.drawio` y futuros clientes automatizados son clientes de ese motor.

- Repo: `/var/home/rubentxu/Proyectos/rust/hodei-diagrams`
- Stack: Rust (2024 edition) + WASM + TypeScript Web Shell + SVG/WebGPU
- Paradigma: Hexagonal/Clean Architecture, command-driven, multi-crate workspace

---

## 2. Reglas del Toolchain (INVARIANTES — NO violar sin ADR)

### 2.1 Rust

- **Versión mínima**: `rustc 1.96.0` (2026) — verificar con `rustc --version`
- **Edition**: `2024` — NO usar `2018` ni `2021` sin ADR que lo justifique
- **MSRV**: 1.85 (edition 2024 requirement; el repo puede exigir más cuando sea necesario)
- Verificar toolchain antes de cualquier `cargo build`:
  ```bash
  rustc --version  # debe ser >= 1.95
  cargo --version  # debe ser >= 1.95
  ```

### 2.2 Crates

- **Regla general**: última versión estable de crates verificada en `crates.io`
- **Excepciones documentadas**: cualquier crate pinned a versión específica requiere ADR
- **Prohibidas en el core** (sin ADR que las justifique): `tokio`, `axum`, `dashmap`, `arc-swap`,
  `rmcp`, `sqlx`, `serde_yaml`, `notify`, `bincode` como decisión base
- **wasm32 target**: verificar soporte real antes de añadir crates con bindings wasm

### 2.4 Librerías JS/TS (web-shell)

- **Regla general**: última versión estable de paquetes npm verificada en `npmjs.com`
- **Excepciones documentadas**: cualquier paquete pinned a versión específica requiere ADR
- Verificar compatibilidad con el build tool (Vite o el que se elija) antes de actualizar

### 2.3 Formato y Linting

```bash
cargo fmt
cargo clippy --workspace --all-targets -- -D warnings
cargo check --workspace
```

Todo commit debe pasar `fmt + clippy + check` limpio.

---

## 3. Git y Conventional Commits

### 3.1 Flujo: Trunk-Based Development

- `main`: rama única de verdad. Protegida. Todo va a `main` vía PR.
- Ramas de feature: `feat/nombre`, `fix/nombre`, `chore/nombre`, `docs/nombre`, `refactor/nombre`
- NO hay ramas de release ni long-lived de desarrollo
- Merge: siempre merge commit (no rebase automático sobre main para preservar historial)
- PRs: título + descripción con referencia a ADR si aplica

### 3.2 Conventional Commits

```
<tipo>(<alcance>): <descripción corta>

[body opcional]

[footer con ADR o ticket]
```

Tipos:

| Tipo | Cuándo |
|------|--------|
| `feat` | nueva funcionalidad visible para el usuario o API |
| `fix` | corrección de bug |
| `docs` | cambios en documentación |
| `chore` | mantenimiento, dependencias, tooling, configuración |
| `refactor` | cambio de código sin cambio de comportamiento |
| `perf` | mejora de rendimiento |
| `test` | solo tests |
| `ci` | cambios en CI/CD |
| `revert` | reversión de un commit anterior |

Ejemplos:
```
feat(core): add CellId with stable engine-owned identity
fix(format): correct edge label parsing in mxGraphModel
docs(adr): add 0029 on spatial index strategy
chore(deps): update quick-xml to 0.37
refactor(core): extract Geometry into its own store module
```

### 3.3 Estructura de Ramas

```
main (protected)
├── feat/drawio-roundtrip-v1
├── feat/diagram-scene
├── feat/svg-renderer
├── fix/label-parsing-nullgeo
├── chore/add-ci
├── docs/adr-0029-spatial-index
└── ...
```

### 3.4 Reglas del Flux

1. Cada `feat` o `fix` significativo = una PR contra `main`
2. Commits atómicos dentro de la rama de feature
3. Rebase interactivo sobre `main` antes de PR solo para limpiar commits (no obligatorio)
4. Merge commit obligatorio en PR — no fast-forward
5. Si el PR es grande (>400 líneas), usar skill `chained-pr` para partirlo
6. Mensaje de PR: referencia al ADR o issue si existe

---

## 4. Arquitectura de Crates (from ADRs)

```
/var/home/rubentxu/Proyectos/rust/hodei-diagrams/
├── Cargo.toml              # workspace root
├── crates/
│   ├── diagram-core/      # domain model: pages, vertex, edge, group, geometry, style, label
│   │                       # slotmap stores, stable IDs, thiserror
│   ├── diagram-format-drawio/  # quick-xml parser, raw model, domain mapping, flate2, base64
│   │                          # preserve-unknown strategy, compatibility diagnostics
│   ├── diagram-compat-testkit/ # corpus, golden files, round-trip, diagnostics assertions
│   ├── diagram-commands/   # commands, undo/redo, history (separate from core)
│   ├── diagram-layout/    # layout algorithms (depends on core only)
│   ├── diagram-routing/   # connector routing, orthogonal, waypoints (depends on core only)
│   ├── diagram-scene/      # scene/display list projection (separate from core and render)
│   ├── diagram-render-svg/ # SVG backend consuming scene
│   ├── diagram-render-wgpu/ # WebGPU backend (future phase)
│   └── diagram-wasm/      # thin wasm adapter: boundary APIs, shared buffers, events
├── web-shell/             # TypeScript minimal shell (outside crates/)
└── docs/
    ├── adr/               # 0001-0028+ decisions
    └── ...
```

### Deps por capa (latest stable, ADR-0010):

| Crate | Deps clave |
|-------|-----------|
| `diagram-core` | `thiserror`, `serde`, `slotmap`, `smallvec`, `bitflags` |
| `diagram-format-drawio` | `quick-xml`, `flate2`, `base64`, `serde`, `thiserror` |
| `diagram-routing` | `rstar`, `pathfinding`, `smallvec`, `thiserror` |
| `diagram-layout` | `petgraph`, `smallvec`, `rayon` (opt, native), `thiserror` |
| `diagram-render-svg` | `smallvec`, `thiserror` |
| `diagram-wasm` | `wasm-bindgen`, `js-sys`, `web-sys`, `serde` (debug) |
| `diagram-render-wgpu` (futuro) | `wgpu`, `bytemuck`, `encase` |
| `diagram-compat-testkit` | `anyhow`, `tracing`, `serde_json`, `walkdir`, `ignore` |

### Reglas de Deps (INVARIANTES):

- `diagram-core` NO depende de: `diagram-commands`, `diagram-layout`, `diagram-routing`, `diagram-scene`, `diagram-render-*`, `diagram-wasm`
- `diagram-format-drawio` depende SOLO de `diagram-core`
- `diagram-commands` depende de `diagram-core`
- `diagram-scene` depende de `diagram-core`
- `diagram-render-svg` depende de `diagram-scene`
- `diagram-routing` depende de `diagram-core`
- `diagram-layout` depende de `diagram-core`
- `diagram-wasm` depende de `diagram-core`, `diagram-scene`, `diagram-commands`
- Web Shell (TS) NO es parte del workspace Rust

---

## 5. SDDK — SDD Kernel Workflow

El proyecto usa **SDD Kernel** para planificar, ejecutar y documentar cambios.

### 5.1 Comandos SDDK

| Comando | Descripción |
|---------|-------------|
| `/sddk-init` | Inicializar contexto SDDK para el proyecto |
| `/sddk-explore <tema>` | Investigar un tema antes de comprometerse |
| `/sddk-new <cambio>` | Explorar + proponer un cambio nuevo |
| `/sddk-ff <cambio>` | Fast-forward: proponer + spec + design + tasks |
| `/sddk-continue [cambio]` | Ejecutar siguiente fase lista del kernel |
| `/sddk-apply [cambio]` | Implementar las tareas del cambio |
| `/sddk-verify [cambio]` | Verificar con lentes del kernel |
| `/sddk-archive [cambio]` | Archivar cambio completado |

### 5.2 Fases SDDK y Orden

```
explore → propose → spec → design → tasks → apply → verify → archive
                  ↘ design ↙
```

- `spec` y `design` pueden ejecutarse después de `propose`
- `tasks` requiere `spec` + `design`
- `apply` requiere `tasks` + `spec` + `design`
- `verify` requiere `apply` con progreso

### 5.3 Reglas SDDK (INVARIANTES)

1. **Cada cambio significativo = un ADR** cuando sea hard-to-reverse, sorprendente sin contexto, o resultado de trade-off real
2. **Contexto antes de decisión**: antes de tomar una decisión, el orchestrator debe verificar el estado de CONTEXT.md y docs/adr/
3. **Artifact store**: usar `engram` para persistir decisiones y aprendizajes
4. **Lentes obligatorias**: `entropy-sdd` (siempre), `cognicode-sdd` (si disponible), `chronos-sdd` (para runtime bugs)
5. **Sin skip de fase**: no saltarse `verify` antes de `archive`
6. **Test-first en bootstrap**: el primer test es un round-trip `.drawio` fixture

---

## 6. Agentes Disponibles y Cuándo Delegar

### 6.1 Orchestrator (siempre disponible)

El orchestrator ES el coordinador. Delega SEGÚN la fase:

| Problema / Necesidad | Agent a delegar |
|----------------------|-----------------|
| Investigación de compatibilidad, comportamiento draw.io | `sddk-explore` |
| Proponer cambio nuevo | `sddk-propose` |
| Escribir spec de comportamiento | `sddk-spec` |
| Diseño técnico y arquitectura | `sddk-design` |
| Desglose en tareas implementables | `sddk-tasks` |
| Implementar código | `sddk-apply` |
| Verificar contra specs y tests | `sddk-verify` |
| Archivar y sincronizar ADRs | `sddk-archive` |

### 6.2 Agentes Especializados (delegar según necesidad)

| Skill / Agente | Trigger |
|----------------|---------|
| `grill-with-docs` | Cuando hay decisiones ambiguas, lenguaje vago, o conflictos con el glosario existente. Entrevistar hasta cerrar terminology y dependencias. |
| `improve-codebase-architecture` | Después de implementar features significativas. Revisar acoplamiento, deuda, y oportunidades de refactor. |
| `auto-grill-loop` | Cuando una propuesta, diseño o plan necesita validación adversarial en múltiples pasadas. |
| `judgment-day` | Cuando se necesita revisión dual a ciegas antes de merge. |
| `work-unit-commits` | Al preparar PRs grandes. Planificar commits como unidades de revisión. |
| `chained-pr` | PRs >400 líneas o múltiples cambios lógicos encadenados. |
| `branch-pr` | Crear PRs con issue-first checks. |
| `issue-creation` | Crear issues con validación antes de crear. |
| `skill-registry` | Después de cambiar skills o agentes. Mantener el registro actualizado. |
| `diagnose` | Bugs difíciles, regresiones de rendimiento, crashes. |
| `test-pyramid` | Diseñar estrategia de tests, auditoría de cobertura, diseño de tests. |
| `cognicode-sdd` | Análisis de impacto, refactoring seguro, validación de arquitectura. |
| `chronos-sdd` | Bugs de runtime, data races, regresiones de memoria, tracing de ejecución. |
| `entropy-sdd` | Análisis de connascence, verificación SOLID, calidad de diseño. |
| `design-an-interface` | Diseñar API, explorar opciones de interfaz, comparar shapes de módulos. |
| `frontend-design` | UI web del editor (web-shell). Usar cuando se diseñe la interfaz visual. |
| `accessibility` | Auditoría WCAG, navegación de teclado, screen readers. |
| `best-practices` | Seguridad, compatibilidad, code quality. |
| `web-quality-audit` | Performance, accesibilidad, SEO, web best practices. |
| `playwright-best-practices` / `playwright-cli` | E2E tests del editor web. |
| `rust-patterns` | Patrones Rust avanzados, API design, generics, concurrency. |
| `go-testing` | Tests en Go (si se usa Go en tooling). |
| `teach` | Cuando el usuario quiera aprender un concepto del proyecto. |

### 6.3 Agentes SDD Tradicional (NO usar desde kernel flow)

**NO lanzar** `sdd-*` agentes tradicionales desde el flujo kernel SDDK.
Usar SOLO `sddk-*` agentes listados arriba.

### 6.4 Cuándo NO delegar

- Decisiones triviales o de estilo ya cubiertas por linting/format
- Decisiones ya tomadas en ADRs existentes (verificar antes)
- Decisiones que requieren juicio del usuario (escalar con grill-with-docs)

---

## 7. Skills Recomendadas por Contexto

### 7.1 Para enrichment de contexto (grill-with-docs)

**Trigger**: cuando el usuario propone algo ambiguo, contradice el glosario, o no hay consenso sobre un término o decisión.

**Uso**: delegar a `grill-with-docs` para entrevistar, resolver terminología, y actualizar `CONTEXT.md` y ADRs inline.

### 7.2 Para revisión post-implementación (improve-codebase-architecture)

**Trigger**: después de implementar features significativas o cuando el código muestra señales de deuda.

**Uso**: delegar a `improve-codebase-architecture` para encontrar oportunidades de refactor, consolidar acoplamiento, y mejorar testabilidad.

### 7.3 Para decisiones de diseño (design-an-interface)

**Trigger**: cuando se diseña una API nueva, un módulo, o la interacción entre crates.

**Uso**: delegar a `design-an-interface` para explorar múltiples soluciones de interfaz radicalmente diferentes.

### 7.4 Para validación adversarial (auto-grill-loop)

**Trigger**: antes de comprometerse con una propuesta, plan, o diseño importante.

**Uso**: delegar a `auto-grill-loop` para pasadas iterativas de análisis, evidencia, y veredicto.

---

## 8. Fuentes de Conocimiento y Prioridad

| Prioridad | Fuente | Descripción |
|-----------|--------|-------------|
| 1 | Código / Tests | La realidad del sistema |
| 2 | Specs / Tasks | Requisitos documentados |
| 3 | ADRs | Decisiones tomadas y su rationale |
| 4 | CONTEXT.md | Glosario y lenguaje del proyecto |
| 5 | Memorias Engram | Aprendizajes persistidos |
| 6 | Conversación / Chat | Solo si no hay fuente durable |

**Regla**: si el código contradice la documentación, el código manda.
Si la documentación contradice la conversación, verificar con código.

---

## 9. Roadmap y Trazabilidad

### Estado actual (bootstrapped)

```
[✓] ADRs 0001-0028: Arquitectura y estrategia
[✓] Workspace: crates/ con 3 crates iniciales
[✓] Git: inicializado con conventional commits
[✓] CI local: clippy + fmt + check
[ ] diagram-commands (pendiente)
[ ] diagram-scene (pendiente)
[ ] diagram-layout (pendiente)
[ ] diagram-routing (pendiente)
[ ] diagram-render-svg (pendiente)
[ ] diagram-render-wgpu (futuro)
[ ] diagram-wasm (pendiente)
[ ] web-shell TypeScript (pendiente)
```

### ADR Inventory (0001-0028)

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

---

## 10. Reglas de Artefactos

### 10.1 ADRs

- Ubicación: `docs/adr/NNNN-slug.md`
- Formato: corto. 1-3 oraciones + contexto + rationale. Secciones opcionales solo si agregan valor.
- Número: el siguiente disponible en secuencia
- Cuándo crear: hard-to-reverse + surprising + real-tradeoff

### 10.2 CONTEXT.md

- Ubicación: raíz del proyecto
- Solo glosario. NO spec, NO scratch pad, NO arquitectura como código.
- Términos: canonical name + definición + _Avoid_
- Atualizar INLINE cuando se cierra un término durante grill-with-docs

### 10.3 Engram Memory

- Guardar PROACTIVAMENTE después de cada decisión, bug fix, patrón, convención
- Título: verbo + qué — corto, buscable
- Contenido: **What** / **Why** / **Where** / **Learned**

---

## 11. Testing

### 11.1 Estrategia

```
Unit tests        → dentro de cada crate (#[cfg(test)])
Integration tests → diagram-compat-testkit (golden files, round-trip)
E2E tests        → web-shell (Playwright)
```

### 11.2 Primer Test (bootstrapped)

El primer `cargo test` que debe existir:

```rust
// diagram-compat-testkit
#[test]
fn roundtrip_simple_rect_drawio() {
    let xml = include_str!("../fixtures/simple-rect.drawio");
    let parsed = parse_drawio(xml).unwrap();
    let written = write_drawio(&parsed).unwrap();
    // estructura básica se preserva: root, mxGraphModel, mxCell
}
```

### 11.3 Reglas

- `cargo test` debe pasar en todo commit
- Coverage mínimo esperado: 0% en bootstrap, crece con cada feature
- Golden files en `diagram-compat-testkit/fixtures/`
- No tests de snapshot sin golden file

---

## 12. Web Shell (fuera de crates/)

- Tecnology: TypeScript + Vite (o similar)
- NO es parte del workspace Rust
- Responsabilidades: DOM events → commands → WASM, render scene → canvas/SVG
- NO contiene lógica de edición, estilos, ni dominio
- Delega TODO al motor Rust vía WASM

---

## 13. Entorno de Desarrollo

### 13.1 Fast Development Cycle (INVARIANTE)

El ciclo de desarrollo rápido es el siguiente, en orden de preferencia:

```bash
# 1. Feedback instantáneo — solo verificación de tipos, sin binario (2-10x más rápido que build)
cargo check --workspace

# 2. Tests en paralelo — hasta 3x más rápido que cargo test
cargo nextest run --workspace

# 3. Hot reload en local — recompila y corre tests en cada cambio
cargo watch -x check -x nextest run

# 4. Build completo cuando check y nextest pasan
cargo build --workspace

# 5. Verificación final: fmt + clippy + check antes de commit
cargo fmt
cargo clippy --workspace --all-targets -- -D warnings
```

### 13.2 Perfiles de Compilación Optimizados para Dev

Agregar al `Cargo.toml` del workspace root:

```toml
# Perfil dev optimizado para ciclos de desarrollo más rápidos
[profile.dev]
opt-level = 0
debug = false           # Mucho más rápido, sin info de debug
split-debuginfo = "unpacked"
incremental = true
codegen-units = 16     # Reduce overhead de paralelismo en incremental builds

[profile.dev.build-override]
opt-level = 0
codegen-units = 16
debug = false

# Release: sin lto hasta que haya medición real; codegen-units = 1 maximiza runtime
[profile.release]
lto = false
codegen-units = 1
```

### 13.3 Herramientas para el Ciclo Rápido (Instalar una vez)

```bash
# Parallel test runner — hasta 3x más rápido que cargo test
cargo install cargo-nextest

# Hot reload: corre comandos en cada cambio de archivo
cargo install cargo-watch

# Compilation cache — solo para builds dev/test (nunca para release)
cargo install sccache

# WASM build + hot reload para el web-shell
cargo install trunk
```

### 13.4 Configuración de sccache (opcional, solo dev/test)

```bash
# En ~/.bashrc o ~/.zshrc
export RUSTC_WRAPPER=sccache

# Verificar que funciona
sccache --version
```

**Importante**: `sccache` es solo para ciclos de desarrollo. No debe activarse en builds de release porque puede relentizarlos hasta un 50%.

### 13.5 Comandos Completos del Entorno

```bash
# Verificar versión
rustc --version  # >= 1.95
cargo --version

# Build
cargo build --workspace

# Lint
cargo fmt
cargo clippy --workspace --all-targets -- -D warnings
cargo check --workspace

# Test rápido (parallel, hot reload)
cargo nextest run --workspace

# Test completo (para antes de PR)
cargo test --workspace

# WASM (cuando aplique)
cargo +wasm32 build -p diagram-wasm  # verificar soporte primero
```

### 13.6 Reglas del Ciclo Rápido (INVARIANTES)

1. **`cargo check`** es siempre el primer paso del ciclo — nunca `cargo build` primero
2. **`cargo nextest run`** reemplaza a `cargo test` para todo el workspace
3. **`cargo watch`** para desarrollo local con hot reload
4. **`sccache`** solo para builds de dev/test; **nunca** para release
5. Perfil dev optimizado desde el día 1 en `Cargo.toml`
6. **No activar `lto` en release** hasta tener medición real de impacto

---

## 14. Glosario Rápido de Proyecto

| Término | Significado |
|---------|-------------|
| `Diagram Engine` | Núcleo del producto: modelo, comandos, import/export, layout, routing, hit-testing, scene |
| `Semantic Port` | Reimplementación en Rust que preserva comportamiento observable y compatibilidad `.drawio` |
| `Behavioral Reference` | Comportamiento observable y semántica `.drawio` como fuente de verdad |
| `Web Shell` | Cliente TypeScript mínimo para browser; no es la aplicación |
| `WASM Boundary` | Interfaz fina WASM: commands/eventos pequeños + shared buffers |
| `Command Flow` | Unidirectional intent→commands→diffs; claridad Redux sin ser un store literal |
| `Render Backend` | Renderer conectable que consume scene del engine; SVG primero, WebGPU después |
| `diagram-scene` | Proyección visual intermedia; shared entre backends de render |
| `preserve-unknown` | Preservar datos `.drawio` no soportados cuando sea seguro |
| `raw/parsed model` | Modelo intermedio del parseo XML antes del mapeo al dominio |

---

*Este documento es la norma viva del proyecto. Actualizar cuando se tome una nueva decisión o se cambie un flujo.*
*Documentos hermanos: `CONTEXT.md`, `docs/adr/*`, `sddk/hodei-diagrams/init`*
