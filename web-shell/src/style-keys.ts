/**
 * style-keys.ts — Shared style key constants
 *
 * These constants mirror the `StyleResolver::known_keys()` in Rust.
 * Keeping them in sync eliminates TS↔Rust connascence.
 */

// ─── Effect Keys ─────────────────────────────────────────────────────────────

/** Keys for shadow effect styling. */
export const SHADOW_KEYS = {
  SHADOW: 'shadow',
  SHADOW_DX: 'shadowDx',
  SHADOW_DY: 'shadowDy',
  SHADOW_BLUR: 'shadowBlur',
  SHADOW_COLOR: 'shadowColor',
} as const;

/** Keys for glass effect styling. */
export const GLASS_KEYS = {
  GLASS: 'glass',
  GLASS_OPACITY: 'glassOpacity',
} as const;

/** Keys for gradient effect styling. */
export const GRADIENT_KEYS = {
  GRADIENT: 'gradient',
  GRADIENT_TYPE: 'gradientType',
  GRADIENT_ANGLE: 'gradientAngle',
  GRADIENT_COLOR1: 'gradientColor1',
  GRADIENT_COLOR2: 'gradientColor2',
  GRADIENT_COLOR3: 'gradientColor3',
  GRADIENT_COLOR4: 'gradientColor4',
  GRADIENT_COLOR5: 'gradientColor5',
} as const;

/** All effect style keys, for validation and iteration. */
export const EFFECT_KEYS = {
  ...SHADOW_KEYS,
  ...GLASS_KEYS,
  ...GRADIENT_KEYS,
} as const;

// ─── Common Style Keys ───────────────────────────────────────────────────────

/** Keys for common (non-effect) style properties. */
export const COMMON_STYLE_KEYS = {
  FILL_COLOR: 'fillColor',
  STROKE_COLOR: 'strokeColor',
  STROKE_WIDTH: 'strokeWidth',
  ROUNDED: 'rounded',
  DASHED: 'dashed',
  FONT_COLOR: 'fontColor',
  FONT_SIZE: 'fontSize',
  FONT_FAMILY: 'fontFamily',
  OPACITY: 'opacity',
} as const;

/** Combined set of all known style keys (effects + common). */
export const ALL_STYLE_KEYS = {
  ...COMMON_STYLE_KEYS,
  ...EFFECT_KEYS,
} as const;

// ─── Type Exports ───────────────────────────────────────────────────────────

/** The shape of the EFFECT_KEYS constant object. */
export type EffectKeys = typeof EFFECT_KEYS;

/** The shape of the COMMON_STYLE_KEYS constant object. */
export type CommonStyleKeys = typeof COMMON_STYLE_KEYS;

/** The shape of the combined ALL_STYLE_KEYS constant object. */
export type AllStyleKeys = typeof ALL_STYLE_KEYS;
