# ADR-0041: Web Shell Toolchain — Vite + Vitest + Playwright

**Date:** 2026-06-19
**Status:** Accepted
**Context:** `sddk/web-shell/explore` → `sddk/web-shell/propose`

## Context

The web-shell is the first TypeScript consumer of the `diagram-wasm` WASM bridge. It sits outside the Rust workspace and needs its own build, test, and lint toolchain. No prior JS/TS decision exists for the web-shell beyond ADR-0033 (npm latest-stable version policy).

## Decision

We adopt the following toolchain for the web-shell:

| Concern | Tool | Rationale |
|---------|------|-----------|
| Build / Dev server | **Vite** | Fast HMR, native WASM ESM support, zero-config TS |
| WASM packaging | **wasm-pack --target web** | Produces ESM-ready `.wasm` + JS glue; compatible with Vite's WASM loading |
| Unit testing | **Vitest** | Vite-native, fast, compatible with TS + WASM mocking |
| E2E testing | **Playwright** | Chromium headless for real WASM loading; cross-browser when needed |
| TypeScript | **strict mode** | `strict: true` in tsconfig.json |
| Linting | **ESLint + @typescript-eslint** | Flat config (eslint.config.js) |
| Formatting | **Prettier** | Consistent code style |
| Package manager | **npm** | Per ADR-0033; latest stable |

## Rationale

- **Vite over webpack/turbopack**: Vite has the most mature WASM ESM story with `wasm-pack --target web`. Trunk is Rust/WASM-specific but overkill for a thin TS shell.
- **Vitest over Jest**: Native Vite integration avoids dual config maintenance. WASM mocking is straightforward with `vi.mock`.
- **Playwright**: Only tool that can load a real `.wasm` in a real browser. Smoke test (R3 mitigation) requires Chromium with WebAssembly enabled.
- **wasm-pack --target web**: Produces ESM output that Vite can consume directly. `--target bundler` would add unnecessary webpack-specific glue.

## Consequences

- **Positive**: Single `npm run verify` command covers lint + typecheck + unit tests + WASM build + Vite build.
- **Positive**: First task is a browser smoke test — fails fast if WASM build is broken.
- **Negative**: Playwright requires Chromium download (~300MB). Acceptable for v1.
- **Negative**: `wasm-pack` must be installed separately (`cargo install wasm-pack`). Documented in README.
