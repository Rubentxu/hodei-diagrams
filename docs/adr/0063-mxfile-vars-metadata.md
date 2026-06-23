# ADR-0063: `<mxfile vars>` Metadata Storage Format

**Date:** 2026-06-23
**Status:** Accepted
**Supersedes:** ADR-0048 §2 (metadata shape, not serialization)

## Context

The properties dialog needs to persist metadata (title, author, description, tags)
backed by the engine, not `localStorage`. The original spec (ADR-0048 §2) assumed
draw.io stores metadata as `<mxfile name="…" author="…" description="…">` attributes.
External verification of the draw.io format revealed this is incorrect.

Evidence from draw.io reference documentation and `mxfile.xsd`:
- `<diagram name="…">` = page name (not document title)
- `<mxGraphModel>` carries only viewport settings (`dx`, `dy`, `grid`, `pageWidth`, etc.)
- **Document-level metadata lives in `<mxfile vars='{…}'>`** — a JSON object attribute,
  edited via draw.io *File > Properties > Edit Data*. Example:
  `<mxfile vars='{"project":"Atlas","author":"Jane Doe"}'>`
- `<mxfile modified="…">` = ISO-8601 modification timestamp (no native `created` attribute)

Additionally, the parser was dropping ALL `<mxfile>` attributes on parse, creating a
preserve-unknown (ADR-0024) gap for host, agent, version, type, and pages attributes.

## Decision

1. **Metadata fields** (`title`, `author`, `description`, `tags`) serialize to and
   deserialize from `<mxfile vars='{…}'>` as a JSON object attribute. The JSON object
   is treated as opaque — only known keys are read/written; unknown keys are preserved.

2. **Engine-stamped `modified`** timestamp lives in `<mxfile modified="…">` as an
   ISO-8601 string. It is separate from the raw wire value and managed by the engine.

3. **`created` timestamp** is engine-managed only — set on first `set_metadata` call,
   never serialized to XML.

4. **All other `<mxfile>` attributes** (`host`, `agent`, `version`, `type`, `pages`,
   etc.) are captured in `RawDrawioDocument.host: BTreeMap<String, String>` and
   re-emitted by the writer (preserve-unknown, per ADR-0024).

## Mapping

```
Import:  <mxfile vars='{"title":"T"}' modified="2024-01-01T00:00:00Z" host="Electron">
         ──► RawDrawioDocument { vars: Some({title:"T"}), modified: Some("…"), host: {host:"Electron"} }
         ──► Metadata { title: Some("T"), author: None, description: None, tags: [], created: epoch, modified: <parsed> }

Export:  Metadata { title: Some("T") }
         ──► RawDrawioDocument { vars: Some({title:"T"}), modified: Some(rfc3339), host: <preserved> }
         ──► <mxfile vars='{"title":"T"}' modified="2024-01-01T00:00:00Z" host="Electron">
```

## Consequences

- **Positive**: Interoperable with actual draw.io files — metadata survives round-trip
  through the draw.io application.
- **Positive**: Fixes the pre-existing preserve-unknown gap on `<mxfile>` attributes.
- **Positive**: Engine-stamped timestamps are separate from wire format, allowing
  internal tracking without polluting the file format.
- **Negative**: Spec scenarios that referenced `<mxfile name="…">` or `<mxGraphModel>` attrs
  need to be updated to reference `<mxfile vars="…">` instead (handled in archive phase).
- **Negative**: `vars` is a JSON string attribute — JSON escaping in XML is handled by
  the serde JSON serializer with quick-xml.

## Alternatives Considered

| Alternative | Rejected Because |
|------------|-----------------|
| `<mxfile name=/author=/description=>` attrs | draw.io ignores these; not a native format |
| `<mxGraphModel name=/author=>` attrs | Wrong semantic level (viewport, not document metadata) |
| Engine-only persistence (no XML mapping) | Defeats `.drawio` round-trip requirement per spec |
| Custom non-standard namespace | Non-interoperable with draw.io |

## References

- `crates/diagram-format-drawio/src/raw.rs` — `RawDrawioDocument { vars, modified, host }`
- `crates/diagram-format-drawio/src/parser.rs` — `<mxfile>` attribute capture
- `crates/diagram-format-drawio/src/writer.rs` — `<mxfile vars= modified= host=…>` emission
- `crates/diagram-format-drawio/src/mapping.rs` — `Metadata` ↔ `vars/modified` mapping
- `crates/diagram-core/src/model.rs` — `Metadata { title, author, description, tags, created, modified }`
- draw.io docs: `drawio.com/docs/reference/diagram-generation`
- `jgraph/drawio-mcp/shared/xml-reference.md`
- `mxfile.xsd` (official schema)