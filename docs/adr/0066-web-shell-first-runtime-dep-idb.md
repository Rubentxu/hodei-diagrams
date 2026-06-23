# ADR-0066: idb as first runtime dependency in web-shell

**Date:** 2026-06-23
**Status:** Accepted
**Ownership:** Web Shell team

## Context

Version history needs IndexedDB for persistence (ADR-0064). The web-shell currently has no runtime JS dependencies beyond `diagram-wasm`. We need an IndexedDB wrapper that is well-maintained, TypeScript-friendly, and has a strong reputation.

## Decision

Use **[`idb`](https://www.npmjs.com/package/idb) v8.0.3** as the first runtime dependency in the web-shell.

```sh
npm install idb@8.0.3
```

`idb` is a small (~1KB) wrapper around the IndexedDB API that provides:
- Promise-based API (IndexedDB is event-based)
- TypeScript generics for stores and indexes
- Tiny footprint — no large runtime

## Alternatives Considered

| Alternative | Rejected because |
|------------|-----------------|
| Raw IndexedDB API | Callback-based; verbose; different API across browsers |
| `Dexie.js` | ~40KB minified; overkill for simple key-value snapshot storage |
| `localforage` | ~10KB; prefers localStorage fallback; not ideal for structured snapshot data |
| `fake-indexeddb` | Only for testing; not a runtime option |

## Version Pin Rationale

`idb` follows semver strictly. We pin to `8.0.3` rather than `^8.0.0` because:
- `idb` has a strong backward-compatibility record, but a pinned version prevents surprise migrations in CI.
- The API surface is stable; updates to `idb` v9+ will be evaluated manually before upgrading.

## Reputation

`idb` is maintained by **Jake Archibald** (Google Chrome team, former editor of the IndexedDB spec). It is the de facto standard IndexedDB wrapper in the web platform community, used in production by many high-profile projects.

## Consequences

- **Positive**: Minimal, well-tested, TypeScript-native IndexedDB wrapper.
- **Positive**: Jake Archibald's reputation provides confidence in long-term maintenance.
- **Negative**: First runtime npm dependency in the web-shell — introduces `package-lock.json` maintenance.

## References

- `npm view idb version` → 8.0.3
- ADR-0064: Snapshot format = drawio XML canonical
- ADR-0041: Web Shell Toolchain
