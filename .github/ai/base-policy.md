# Illusions Shared Base Policy

Version: 1.0.0
Status: Active canonical policy

## 1. Language

- Code and docs: English or Japanese only.
- UI text shown to end users: Japanese required.
- Forbidden in code/docs: Chinese, Korean, and any language other than English or Japanese.

## 2. Branch and PR

- Feature/fix PR base is always `dev`.
- Never open routine PRs against `main`.
- Use `gh pr create --base dev` explicitly.
- Hotfix flow is exceptional: `main` first, then cherry-pick to `dev`.

## 3. TypeScript and Quality Gates

- Strict TypeScript is required.
- Do not introduce `any` unless there is a documented, justified exception.
- Run `npx tsc --noEmit` before opening or updating a PR.

## 4. Storage Contract

- Use `getStorageService()` for persistence.
- Do not use `localStorage`, direct IndexedDB, or ad-hoc storage implementations in app code.

## 5. Security Baseline

- No hardcoded secrets.
- Electron security posture must preserve `contextIsolation: true` and `nodeIntegration: false`.
- No unsafe dynamic code execution patterns (`eval`, dynamic `Function`, unsanitized HTML injection).

## 6. Review Scope

- Prioritize correctness, data integrity, security, and user-facing regressions.
- Do not block merges for purely stylistic nitpicks that do not change behavior.

## 7. GitHub API Budget

- Treat GitHub API quota as a shared, limited resource.
- Do not use high-frequency polling (`gh run watch`, repeated `gh pr checks`, or equivalent API loops) for CI or release status.
- Query only when the result can change the next action; prefer a single final status check, webhook/event-driven updates when available, or non-API evidence such as a pushed Git tag.
- After a rate-limit response, stop API polling immediately and use a low-frequency alternative rather than retrying the same endpoint.
