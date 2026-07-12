# Illusions Release Policy

Version: 1.1.0
Status: Active canonical policy

## Canonical Topology

`feature/*` -> `dev` -> `beta` -> `main`

- `dev`: integration branch for all regular development work.
- `beta`: preview channel fed from `dev` using the release-beta workflow.
- `main`: production branch promoted from `beta` manually.

## Stable Promotion

- Stable promotion is `beta -> main`.
- Manual process — the automated weekly Friday workflow (`weekly-release.yml`) was removed
  2026-07-12. A human creates and merges the `beta -> main` PR when ready.

## Tooling Alignment

- `.claude/skills/release-beta/SKILL.md` handles `dev -> beta` only.
- Agent and instruction files must not describe `dev -> main` as the routine path.

## Pull Request Base Rule

- All non-hotfix PRs target `dev`.
- `main` base is allowed only for emergency hotfix handling.
