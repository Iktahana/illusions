# AI Prompt Governance Workflow

## Ownership

- Foundation policy (`base-policy.md`, `release-policy.md`): maintainers
- Tool overlays (`overlays/*.md`): tool owners + maintainers
- Domain policies (`domain/*.md`): subsystem owners

## Update Rules

1. Edit canonical files first.
2. Update transition entrypoints only to keep links and minimal compatibility text.
3. Avoid copying long policy sections into multiple files.
4. Record important governance changes in `CHANGELOG.md`.

## Review Requirements

- Release policy changes require cross-tool agreement (Claude/Codex/Copilot).
- Any change that affects branch topology, PR base, or language policy is treated as high-impact.

## Deprecation Strategy

- Keep legacy files as wrappers during migration.
- Remove duplicated policy text gradually after teams confirm no workflow breaks.
