# Domain Policy: Lint Ruleset Authoring

## Dictionary Readiness Contract

Rules that depend on dictionary access (`getDictAccess()`) must not hard-fail when dictionary state is not ready.

- If `getHealth().state !== "ready"`, emit a warning and disable only the affected rule behavior.
- `ctx.toolkit.dict` is treated as fail-safe and may return empty results when not ready.

## Ruleset Packaging

- Distribute checks as ruleset modules.
- Follow contracts in `docs/ruleset/`.
- Reuse `ctx.toolkit` helpers (for example NFKC normalization and unit dedup) instead of rebuilding utility logic.
- Prefer standard normalization (NFKC) over hardcoded mapping tables when possible.
