# Apply Progress: diagram-wasm-export

**Status**: ✅ All 9 tasks completed (30/30 sub-tasks)

## Tasks Completed

| Task | Status | Files Changed | Verification |
|------|--------|---------------|-------------|
| 1. Editor IdMap storage | ✅ | `Cargo.toml`, `editor.rs` | `cargo check -p diagram-commands` |
| 2. WASM import pass IdMap | ✅ | `import.rs` | `cargo check -p diagram-wasm` |
| 3. WASM export function | ✅ | `export.rs` (NEW) | `cargo check -p diagram-wasm` |
| 4. WASM wire-up | ✅ | `lib.rs` | `cargo check -p diagram-wasm` |
| 5. TypeScript types + session | ✅ | `types.ts`, `session.ts`, `wasm-loader.ts`, 3 test files | `npx tsc --noEmit` |
| 6. Web-shell UI | ✅ | `ui.ts`, `main.ts` | `npx vitest run` (83/83) |
| 7. Native round-trip test | ✅ | `wasm_native.rs` | `cargo test -p diagram-wasm` (14/14) |
| 8. Playwright E2E test | ✅ | `export-roundtrip.spec.ts` (NEW) | `npx playwright test` (4/4) |
| 9. ADR-0043 + Polish | ✅ | `Cargo.toml` (v bump), `ROADMAP.md`, ADR-0043 | `cargo clippy --workspace -D warnings` clean |

## Router Context Used

- **Knowledge Coverage**: proposal.md, spec.md, design.md, tasks.md, explore-report.md all used
- **Context Quality**: C3 — write chain existed and tested; only IdMap gap needed filling
- **Problem Taxonomy**: boundary/seam (IdMap across format↔commands, XML across WASM↔JS), coupling/connascence (CoT IdMap type), API contract (12th WASM export)
- **Domain Language**: export_drawio, IdMap, to_raw, write_drawio, replace_model all resolved
- **Invariants Preserved**: thin WASM adapter, unsafe_code="forbid", 11 existing exports unchanged, ExportFailed prefix, no cycle in dep graph
- **Recommended Effort**: deepen — correct (engine-side Editor change + WASM wrapper)

## Files Changed

### Rust Core (5 files)
| File | Action | Description |
|------|--------|-------------|
| `crates/diagram-commands/Cargo.toml` | modify | Add `diagram-format-drawio` dep |
| `crates/diagram-commands/src/editor.rs` | modify | Add `id_map: Option<IdMap>`, update `replace_model` sig, add `id_map()` accessor |
| `crates/diagram-wasm/src/import.rs` | modify | Pass `Some(id_map)` to `replace_model` |
| `crates/diagram-wasm/src/export.rs` | **create** | `export_drawio(handle) -> Result<String, JsValue>` |
| `crates/diagram-wasm/src/lib.rs` | modify | `mod export` + `pub use export_drawio` |

### TypeScript / Web Shell (6 files)
| File | Action | Description |
|------|--------|-------------|
| `web-shell/src/types.ts` | modify | Add `export_drawio` to WasmModule |
| `web-shell/src/session.ts` | modify | Add `exportDrawio()`, `'ExportFailed'` to categorizeError |
| `web-shell/src/ui.ts` | modify | Add `saveButton` to UiElements, create button in toolbar |
| `web-shell/src/main.ts` | modify | Wire save button, `downloadDrawio()` helper |
| `web-shell/src/wasm-loader.ts` | modify | Wire `mod.export_drawio` |
| `web-shell/tests/*.ts` | modify | Add `export_drawio: vi.fn()` to 3 mock files |

### Tests (2 files)
| File | Action | Description |
|------|--------|-------------|
| `crates/diagram-wasm/tests/wasm_native.rs` | modify | Add `export_drawio_roundtrip` + wasm32-gated error test |
| `web-shell/tests/e2e/export-roundtrip.spec.ts` | **create** | 4 Playwright E2E tests |

### Documentation (2 files)
| File | Action | Description |
|------|--------|-------------|
| `docs/adr/0043-commands-depends-on-format-for-idmap-storage.md` | **create** | Document U1 decision |
| `docs/ROADMAP.md` | modify | v0.5.3, export_drawio ✅ |

## Verification Results

### Rust Tests (245 total)
```
34 diagram-commands unit tests         ✅
11 editor_workflow integration tests   ✅
2 undo_remove_page tests               ✅
20 diagram-compat-testkit tests        ✅
14 diagram-core tests                  ✅
23 diagram-format-drawio tests         ✅
40 diagram-render-svg tests            ✅
5 e2e render tests                     ✅
7 groups_and_paths tests               ✅
4 leaf_primitives tests                ✅
7 multi_page_and_style tests           ✅
46 diagram-scene tests                 ✅
18 golden_scenes tests                 ✅
14 diagram-wasm tests (=13 existing + 1 NEW export_drawio_roundtrip) ✅
```

### JS Tests (83 Vitest)
```
7 test files, 83 tests                 ✅
```

### E2E Tests (25 total, 4 NEW)
```
4 export-roundtrip.spec.ts             ✅  (Save button, download, error, re-import)
7 viewer.spec.ts                       ✅
2 get-scene-smoke.spec.ts              ✅
2 editor-select.spec.ts                ✅
2 editor-drag.spec.ts                  ✅
2 editor-palette.spec.ts               ✅
2 editor-delete.spec.ts                ✅
2 editor-undo.spec.ts                  ✅
```

### Linting
```
cargo fmt                              ✅ (no changes)
cargo clippy --workspace -D warnings   ✅ (clean)
cargo check --workspace                ✅ (clean)
npx tsc --noEmit                       ✅ (clean)
```

### Invariant Checks
| Invariant | Result |
|-----------|--------|
| 11 existing exports unchanged | ✅ — signature diff = empty for prior 11 |
| 12 exports total (11 + 1 new) | ✅ — `export_drawio` is 12th |
| `unsafe_code = "forbid"` intact | ✅ — zero `unsafe` blocks in diagram-wasm |
| `ExportFailed:` error prefix | ✅ — mirrors `ImportFailed:` |
| No breaking changes to existing API | ✅ — all existing tests pass unchanged |

## Risks

- **IdMap staleness (U3)**: Scoped out per spec. Entities added via commands after import have no raw ID mapping. Current behavior: `to_raw` emits diagnostics and skips them. The export still succeeds.
- **`Box::leak` on error strings**: Existing pattern from `import.rs`. Each export error leaks a small `Box<str>` (~100 bytes) — acceptable for error-only paths.
- **`.gitignore` on `docs/`**: ADR and ROADMAP files must be `git add -f` or the gitignore rule must be revisited.

## Next Recommended

1. Create PR: `gh pr create --title "feat(wasm): add export_drawio with IdMap storage in Editor" --body "Closes diagram-wasm-export milestone"`
2. Rebuild WASM in CI pipeline (`wasm-pack build --target web crates/diagram-wasm --out-dir web-shell/src/wasm`)
3. Run Playwright E2E tests in CI
4. Merge via merge commit (preserve history)
5. Tag `v0.5.3` post-merge
