# Illusions AI Prompt Governance

This directory is the canonical source of AI guidance for Claude, Codex, and Copilot.

## Start Here

1. `base-policy.md` - Shared non-negotiable rules
2. `release-policy.md` - Branch and release truth
3. `overlays/` - Tool-specific deltas only
4. `domain/` - Specialized domain policies
5. `governance.md` - Ownership and update workflow

## Canonical Rule

Do not duplicate foundation rules across multiple files.
Agent-specific files should only describe behavior unique to that agent.

## Legacy Compatibility

`CLAUDE.md`, `AGENTS.md`, and `.github/copilot-instructions.md` remain available as transition entrypoints.
They should link back to this directory and avoid restating full policy blocks.
