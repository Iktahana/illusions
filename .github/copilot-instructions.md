# Illusions Project - GitHub Copilot Instructions

This file is a transition entrypoint.
Canonical AI policy now lives under `.github/ai/`.

## Canonical Entry

- Shared rules: `.github/ai/base-policy.md`
- Release truth: `.github/ai/release-policy.md`
- Copilot-specific overlay: `.github/ai/overlays/copilot.md`
- Governance workflow: `.github/ai/governance.md`
- Component map: `.github/ai/domain/component-map.md`

## Critical Reminder

- All regular PRs must target `dev`.
- Do not use `main` as PR base except emergency hotfixes.
- Use `gh pr create --base dev` explicitly.

## Project Snapshot

Illusions is a Japanese novel writing editor with vertical writing, ruby notation, and local-first storage.

Main stack:

- Next.js + React + TypeScript (strict)
- Electron desktop shell
- Milkdown-based editor plugins
- Storage via unified StorageService

## Agent Discovery

Custom agents live in `.github/agents/`.
Use them for focused workflows (review, maintenance, CI diagnostics, docs upkeep).

## Migration Note

Long duplicated policy blocks were intentionally removed from this file.
If a policy is missing here, treat `.github/ai/` as source of truth.
