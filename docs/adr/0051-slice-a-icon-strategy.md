# ADR-0050: Slice A Icon Strategy — Emoji → Inline-SVG Migration

**Fecha:** 2026-06-22
**Autor:** SDDK Archive
**Tipo:** Decisión técnica
**Alcance:** web-shell/src/icon.ts, sidebar.ts, navbar.ts, rail.ts

## Contexto

Slice A (Product Presence) requiere migrar 17 category headers del sidebar desde emoji (⬜📋➡️🔄) a inline-SVG. La decisión afecta todos los headers de categoría del sidebar y es **hard-to-reverse** — una vez que los iconos SVG están en producción, cambiarlos requiere el mismo esfuerzo que implementarlos.

## Decisión

Se migra a inline-SVG mediante un módulo estático `icon.ts` que exporta constantes de string con el markup SVG. Los iconos se consumen via `innerHTML` en los componentes que los necesitan.

## Rationale

| Alternativa | Evaluación |
|-------------|------------|
| Emoji | Viola DESIGN.md §soberanía (no saturado, sin glassmorphism excesivo). Inconsistente con los SVG del rail. |
| Icon font (Font Awesome, etc.) | Dependencia adicional, requiere runtime fetch, aumenta bundle. |
| SVG sprite sheet | Require runtime fetch o build-time bundling. Más complejo que strings estáticos. |
| **inline-SVG (elegido)** | Sin dependencias, sin fetch, código fuente legible, coincide con patrón `RAIL_ICONS` existente. |

## Geometry Canonical

```
viewBox="0 0 16 16"
stroke="currentColor"
stroke-width="1.5"
fill="none"
```

Los iconos renderizan a `--icon-size` via CSS. El stroke `currentColor` permite herencia de color del tema.

## Impacto

| Archivo | Cambio |
|---------|--------|
| `web-shell/src/icon.ts` | Nuevo archivo — `ICONS` + `CATEGORY_ICONS_SVG` (~196 LOC) |
| `web-shell/src/sidebar.ts` | Reemplaza `CATEGORY_ICONS` (emoji) con import de `icon.ts` |
| `web-shell/src/navbar.ts` | brand/undo/redo → SVG desde `icon.ts` |
| `web-shell/src/rail.ts` | Iconos del rail ya eran SVG; verificación de consistencia |

## 17 Categorías Migradas

General, Stencils, Arrows, Flowchart, UML, BPMN, AWS, Azure, GCP, Kubernetes, Terraform, Jenkins, Databases, C4, Network, Database, Mockups.

**Nota:** `Databases` y `Database` mapean al mismo icono SVG. La deduplicación de datos es trabajo futuro (fuera del scope de Slice A).

## Contrato de Seguridad

- `icon.ts` es **static string constants** — ningún `innerHTML` de datos de usuario
- No hay fetch runtime para iconos
- El módulo es un **leaf** (sin inbound deps)

## Status

**Completado** — implementado en `feat/slice-a-product-presence` (commit `b6cf34e`).
