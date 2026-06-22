/**
 * icon.ts — Shared inline-SVG icon constants
 *
 * Canonical geometry: viewBox="0 0 16 16", stroke="currentColor",
 * stroke-width="1.5", fill="none", stroke-linecap="round", stroke-linejoin="round"
 *
 * Consumed by: navbar.ts, rail.ts, sidebar.ts, ui.ts
 * Zero runtime deps — static string constants only.
 */

export const ICONS = {
  /** Hodei brand mark — stylized "H" diamond grid */
  BRAND: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 2L14 8L8 14L2 8Z"/>
    <path d="M8 5L11 8L8 11L5 8Z"/>
  </svg>`,

  /** Undo — left-pointing curved arrow */
  UNDO: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 8C3 5.24 5.24 3 8 3C10.76 3 13 5.24 13 8C13 10.76 10.76 13 8 13"/>
    <path d="M3 5L3 8L6 8"/>
  </svg>`,

  /** Redo — right-pointing curved arrow */
  REDO: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M13 8C13 5.24 10.76 3 8 3C5.24 3 3 5.24 3 8C3 10.76 5.24 13 8 13"/>
    <path d="M13 5L13 8L10 8"/>
  </svg>`,

  /** Text tool — capital A */
  TEXT: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 12L8 4L13 12"/>
    <path d="M5.5 9.5H10.5"/>
  </svg>`,

  /** Zoom-to-fit — four arrows pointing outward from center */
  ZOOM_FIT: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2 6V2H6"/>
    <path d="M14 6V2H10"/>
    <path d="M2 10V14H6"/>
    <path d="M14 10V14H10"/>
    <circle cx="8" cy="8" r="2"/>
  </svg>`,

  /** Help — question mark */
  HELP: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="8" cy="8" r="6"/>
    <path d="M6 6C6 4.34 7.34 3 9 3C10.66 3 12 4.34 12 6C12 7.66 10.66 9 9 9V10"/>
    <circle cx="9" cy="12.5" r="0.5" fill="currentColor" stroke="none"/>
  </svg>`,

  /** Clean / success — checkmark */
  CLEAN: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="8" cy="8" r="6"/>
    <path d="M5 8L7 10L11 6"/>
  </svg>`,

  /** Error / warning — exclamation */
  ERROR: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="8" cy="8" r="6"/>
    <path d="M8 5V9"/>
    <circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none"/>
  </svg>`,
} as const satisfies Record<string, string>;

// ─── Category icons ───────────────────────────────────────────────────────────

/** Fallback icon for unknown category keys */
const FALLBACK_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="8" cy="8" r="6"/>
  <path d="M8 5V8L10 10"/>
</svg>`;

/**
 * 17 category icons as inline SVGs.
 * Both 'Databases' and 'Database' map to the same db icon (spec §Open Question #4).
 */
export const CATEGORY_ICONS_SVG: Readonly<Record<string, string>> = {
  /** General shapes — square grid */
  General: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="2" width="5" height="5" rx="0.5"/>
    <rect x="9" y="2" width="5" height="5" rx="0.5"/>
    <rect x="2" y="9" width="5" height="5" rx="0.5"/>
    <rect x="9" y="9" width="5" height="5" rx="0.5"/>
  </svg>`,

  /** Stencils — stacked cards */
  Stencils: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="2" width="8" height="11" rx="1"/>
    <rect x="5" y="4" width="8" height="11" rx="1"/>
  </svg>`,

  /** Arrows — arrowhead */
  Arrows: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 8H13M10 5L13 8L10 11"/>
  </svg>`,

  /** Flowchart — process diamond */
  Flowchart: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 2L14 8L8 14L2 8Z"/>
  </svg>`,

  /** UML — class rectangle */
  UML: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="2" width="12" height="12" rx="1"/>
    <path d="M2 6H14"/>
    <path d="M2 10H14"/>
    <path d="M7 6V10"/>
  </svg>`,

  /** BPMN — circle with cross */
  BPMN: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="8" cy="8" r="6"/>
    <path d="M5 8H11M8 5V11"/>
  </svg>`,

  /** AWS — cloud shape */
  AWS: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 11C2.9 11 2 10.1 2 9C2 7.9 2.9 7 4 7C4.2 5.1 6 3.5 8 3.5C9.6 3.5 11 4.5 11.6 6C12.1 5.9 12.5 5.5 12.5 5C12.5 4.2 11.8 3.5 11 3.5H4C3.4 3.5 3 3.9 3 4.5C3 5.1 3.4 5.5 4 5.5H11C11.6 5.5 14 5.8 14 9C14 11.2 12.5 12.5 11 12.5C10.6 12.5 10.2 12.4 9.9 12.2C9.2 13.2 8.1 13.9 7 13.9C5.9 13.9 4.9 13.4 4.3 12.6C4 12.4 3.6 12.3 3.2 12.3C3 12.3 2.9 12.3 2.7 12.4C2.5 11.9 2.4 11.4 2.4 11H4C4.6 11 5 11.4 5 12C5 12.6 4.6 13 4 13C3.8 13 3.5 12.9 3.3 12.8C3.5 12.7 3.7 12.6 4 12.6C4.4 12.6 4.8 12.7 5.1 12.9C5.5 12.5 6.2 12.3 7 12.3C8 12.3 8.8 12.7 9.3 13.3C9.7 12.7 10.5 12.3 11.5 12.3C12.3 12.3 13 12.6 13.5 13.1C13.7 12.5 14 11.8 14 11C14 10.4 13.6 10 13 10H12C11.4 10 11 9.6 11 9C11 8.4 11.4 8 12 8H13C13.6 8 14 8.4 14 9C14 9.4 13.9 9.8 13.7 10.2C14.5 10.8 15 11.4 15 12.3C15 13.5 13.3 14.5 11 14.5C9 14.5 4 14.5 4 14.5"/>
  </svg>`,

  /** Azure — diamond with A */
  Azure: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 2L14 8L8 14L2 8Z"/>
    <path d="M8 5.5L10.5 8L8 10.5L5.5 8Z"/>
  </svg>`,

  /** GCP — cloud with g */
  GCP: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 10C3.3 10 2 8.7 2 7C2 5.7 2.9 4.6 4 4.2C4.1 2.9 5.2 2 6.5 2C7.1 2 7.6 2.2 8 2.4C8.4 2.2 8.9 2 9.5 2C10.8 2 12 3 12.4 4.1C12.9 4 13.4 4 13.8 4.2C13.9 5.2 13.2 6.1 12.2 6.3C12.6 6.7 12.8 7.3 12.8 8C12.8 9.6 11.5 11 10 11.4C10 11.4 9.8 11.4 9.6 11.4C9.3 13.2 7.7 14.5 5.8 14.5C4.5 14.5 3.3 14 2.3 13C2 12.8 1.7 12.5 1.5 12.2C1.4 12 1.3 11.8 1.3 11.6C1.1 10.9 1.3 10.1 2 9.6C2.1 9.5 2.2 9.5 2.3 9.4C2.4 9.3 2.4 9.2 2.4 9.1C2.7 8.5 3.3 8 4 7.7C4.2 7.6 4.5 7.6 4.7 7.7C5.1 7.3 5.6 7 6.2 6.9C7.2 6.7 8.2 7.2 8.7 8C8.9 8.3 9 8.7 9 9.1C9 9.8 8.5 10.4 7.8 10.6C7.6 10.7 7.4 10.7 7.2 10.7C6.9 10.7 6.7 10.6 6.5 10.5C6.3 10.4 6.1 10.4 5.8 10.5C5.4 10.6 5 10.4 4.8 10.1C4.6 9.8 4.7 9.4 5 9.2C5.3 9 5.7 9.1 5.9 9.4C6.1 9.7 6.4 9.8 6.7 9.8C7.2 9.8 7.6 9.4 7.6 8.9C7.6 8.5 7.3 8.1 6.9 8C6.5 7.9 6 8 5.7 8.3C5.4 8.6 5.3 9 5.4 9.4C5.5 9.8 5.8 10.1 6.2 10.2C6.5 10.3 6.8 10.2 7 10C7.2 9.8 7.2 9.5 7 9.3C6.9 9.2 6.7 9.1 6.5 9.1C6.3 9.1 6.1 9.2 6 9.4C5.8 9.6 5.8 9.9 6 10.1C6.2 10.3 6.5 10.4 6.8 10.3C7.1 10.2 7.3 9.9 7.2 9.6C7.1 9.3 6.8 9.1 6.5 9.1C6.2 9.1 5.9 9.4 5.9 9.7C5.9 10 6.2 10.2 6.5 10.2C6.7 10.2 6.9 10.1 7 9.9C7.1 9.8 7.1 9.6 7 9.5C6.9 9.4 6.7 9.3 6.5 9.3C6.3 9.3 6.1 9.4 6 9.6C5.9 9.8 5.9 10 6 10.2C6.2 10.5 6.5 10.7 6.9 10.7C7.3 10.7 7.7 10.4 7.7 10"/>
  </svg>`,

  /** Kubernetes — ship wheel */
  Kubernetes: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="8" cy="8" r="2"/>
    <path d="M8 1V3M8 13V15M1 8H3M13 8H15"/>
    <path d="M3.05 3.05L4.46 4.46M11.54 11.54L12.95 12.95"/>
    <path d="M3.05 12.95L4.46 11.54M11.54 4.46L12.95 3.05"/>
  </svg>`,

  /** Terraform — square T */
  Terraform: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2 4H14"/>
    <path d="M8 4V14"/>
    <path d="M5 14H11"/>
  </svg>`,

  /** Jenkins — circle with J */
  Jenkins: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="8" cy="8" r="6"/>
    <path d="M5.5 5.5C5.5 4.1 6.6 3 8 3C9.4 3 10.5 4.1 10.5 5.5C10.5 6.9 9.4 8 8 8V11"/>
  </svg>`,

  /** Databases — stacked discs */
  Databases: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="8" cy="5" rx="6" ry="2.5"/>
    <path d="M2 5V11C2 12.66 4.84 14 8 14C11.16 14 14 12.66 14 11V5"/>
    <path d="M2 8.5C2 10.16 4.84 11.5 8 11.5C11.16 11.5 14 10.16 14 8.5"/>
  </svg>`,

  /** C4 model — layered boxes */
  C4: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="1.5" y="5.5" width="5" height="4" rx="0.5"/>
    <rect x="5.5" y="8" width="5" height="3.5" rx="0.5"/>
    <rect x="9.5" y="10" width="5" height="2.5" rx="0.5"/>
  </svg>`,

  /** Network — globe with nodes */
  Network: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="8" cy="8" r="6"/>
    <path d="M8 2V14M2 8H14"/>
    <path d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5"/>
  </svg>`,

  /** Database (duplicate key — same as Databases) */
  Database: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="8" cy="5" rx="6" ry="2.5"/>
    <path d="M2 5V11C2 12.66 4.84 14 8 14C11.16 14 14 12.66 14 11V5"/>
    <path d="M2 8.5C2 10.16 4.84 11.5 8 11.5C11.16 11.5 14 10.16 14 8.5"/>
  </svg>`,

  /** Mockups — phone outline */
  Mockups: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="1.5" width="8" height="13" rx="1.5"/>
    <path d="M6.5 12.5H9.5"/>
    <circle cx="8" cy="11" r="0.5" fill="currentColor" stroke="none"/>
  </svg>`,
};

/**
 * Returns the SVG icon for a given category name.
 * Returns FALLBACK_ICON for unknown categories.
 */
export function categoryIcon(cat: string): string {
  return CATEGORY_ICONS_SVG[cat] ?? FALLBACK_ICON;
}
