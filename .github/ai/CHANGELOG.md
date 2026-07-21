# AI Governance Changelog

## 2026-07-20

- Required every resolved issue to be linked with a closing keyword in its fixing PR, and required verification that the merged PR closes the issue. Direct-to-branch fixes must close the issue manually with a commit reference.

## 2026-07-02

- Introduced canonical AI governance tree under `.github/ai/`.
- Added shared `base-policy.md` and `release-policy.md`.
- Added tool overlays for Claude, Codex, and Copilot.
- Added lint domain policy and component responsibility map.
- Began migration of legacy entrypoint files (`CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`) into wrapper mode.
