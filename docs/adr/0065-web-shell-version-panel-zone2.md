# ADR-0065: Version history panel lives in Zone 2 (sidebar) — amends ADR-0047

**Date:** 2026-06-23
**Status:** Accepted
**Amends:** ADR-0047 §Zone 5 (version history timeline placement)

## Context

ADR-0047 §Zone 5 deferred the version history timeline to v2, locating it in the bottom area alongside page tabs. Since then, two constraints have shifted:

1. **Zone 5 is now occupied** by the diagnostics banner (ADR-0063).
2. **Zone 2 (sidebar) infrastructure already exists** in v1 — the collapsible sidebar with search bar and shape grid is already built.

## Decision

The version history panel is placed in **Zone 2 (sidebar)**, below the shape palette. The UI is a vertical list of snapshots (timestamp + optional label), scrollable, with a restore button per entry.

```
Zone 2 — Left Sidebar (v1.1):
┌─────────────────────┐
│ [🔍 Search shapes]  │
├─────────────────────┤
│ Shapes:             │
│  ▢ Rect            │
│  ▢ RoundedRect     │
│  ▢ Ellipse         │
├─────────────────────┤
│ Version History:    │  ← NEW
│  ● today 14:32     │
│  ○ today 14:28     │
│  ○ today 13:55     │
│  [Restore]         │
└─────────────────────┘
```

## Rationale

| Option | Rejected because |
|--------|-----------------|
| Zone 5 (bottom, horizontal timeline) | Zone 5 is occupied by diagnostics banner; horizontal scrubber needs more horizontal space than a collapsed sidebar allows |
| Zone 3 (canvas overlay) | Overlay blocks editing; modal dialog interrupts flow |
| Zone 4 (right inspector) | Inspector is for selection properties; version history is global document state |
| **Zone 2 (sidebar, vertical list)** | Sidebar already exists; vertical list fits naturally below shape palette; does not block canvas or inspector |

A vertical list is simpler for an MVP than a horizontal scrubber and works well with the sidebar's constrained width.

## Consequences

- **Positive**: Reuses existing sidebar infrastructure — no new layout zones needed.
- **Positive**: Vertical list suits the sidebar's narrow width; no horizontal space requirement.
- **Negative**: Sidebar becomes taller; may need scroll within sidebar if shape palette + history both grow.
- **Negative**: Zone 5 (bottom) remains occupied; diagnostics + version history cannot coexist there without redesign.

## References

- ADR-0047: Web Shell UI v1 Architecture (amended)
- ADR-0063: `<mxfile vars>` Metadata Storage Format (Zone 5 occupant)
