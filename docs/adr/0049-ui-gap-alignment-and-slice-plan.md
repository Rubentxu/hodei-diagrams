# ADR-0049: UI Gap Alignment Against DESIGN.md and draw.io Reference

**Date:** 2026-06-19
**Status:** Accepted
**Context:** Review of current UI (`v0.9.0`) against DESIGN.md and visual reference comparisons.

## Decision

We formalize the gap between the current implemented UI and the target product experience described in `DESIGN.md` and inspired by draw.io, Figma, Linear, Cursor, and Raycast. The gap will be closed through explicit UI slices, each independently reviewable and traceable.

## Current State (v0.9.0)

The product already has:

- 5-zone structural layout
- Navbar with File/Edit/View + quick controls
- Left Sidebar with a functional `General` category
- Central Canvas with SVG render, zoom/pan, page navigation, selection, drag, palette, undo/redo, import/export `.drawio`
- Right Inspector with Style/Text tabs and immediate editing
- Bottom area with page tabs + diagnostics toast

However, the product still reads visually as a **technical shell** rather than a **professional visual modeling platform**.

## Gap Categories

### 1. Product Density Gap

The current UI exposes too little contextual information at a glance. It feels sparse and under-signaled compared to draw.io/Figma-like tools.

**Implication:** the product appears unfinished even when the engine capabilities exist.

### 2. Visual Hierarchy Gap

The canvas dominates correctly, but the surrounding navigation, library, and inspector lack the weight, hierarchy, and affordances expected from an engineering-grade product.

**Implication:** users do not immediately understand the available workflows.

### 3. Affordance Gap

Many controls exist functionally but do not visually communicate capability, state, or next actions strongly enough.

**Implication:** discoverability is low.

### 4. draw.io Alignment Gap

The structure echoes draw.io, but the density and interaction vocabulary do not yet reach the familiarity of draw.io.

**Implication:** users importing draw.io mental models may feel friction.

## Accepted Target

We align the UI toward this product position:

> A professional visual modeling platform for engineering, with draw.io-like learnability, Figma-like canvas priority, and JetBrains/Figma-like inspector density.

## Implementation Strategy

We close the gap in three ordered slices.

### Slice A — Product Presence

Goal: make the application read as a real product, not a shell.

- Strengthen top bar hierarchy
- Add left rail affordances
- Increase sidebar information density and icon presence
- Improve empty states in inspector
- Make page tabs and diagnostics feel intentional

### Slice B — Professional Density

Goal: make the application feel precise and engineering-oriented.

- Grid/guides visual language
- Better status surfaces (zoom, selection, page, mode)
- Compact inspector forms inspired by JetBrains/Figma
- Better typography rhythm and spacing discipline

### Slice C — Platform Surface

Goal: expose the platform aspects that differentiate the product.

- Version history timeline
- Properties dialog
- Presentation mode
- Stencil libraries
- Export surfaces beyond `.drawio`

## What We Explicitly Do Not Do

- We do **not** fake unsupported engine capabilities
- We do **not** copy draw.io literally
- We do **not** add decorative visual noise that violates DESIGN.md sobriety

## Consequences

- UX work becomes reviewable in slices, not in one monolith
- Visual evolution remains tied to concrete engine capabilities
- Future reviewers can understand why some sections are intentionally grayed out or deferred

## References

- ADR-0047: Web Shell UI v1 — 5-Zone Application Layout
- ADR-0048: Deferred Innovations — Version History, Properties, Presentation Mode
- DESIGN.md — layout philosophy, properties panel, version history, presentation mode, design goals
