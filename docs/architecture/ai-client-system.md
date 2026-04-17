# AI Client System

> **Milestone**: 1.3.0  
> **Status**: Design — not yet implemented

## Overview

The AI Client System transforms illusions into a "Claude Code for novel writing" — an agentic AI assistant that understands the writer's project context and can autonomously execute writing tasks, while remaining under the writer's control.

Unlike the current scattered AI features in `/lib/ai/`, this system provides a unified agent layer that:

- Supports multiple LLM providers (OpenAI, Anthropic, Google, etc.)
- Operates in semi-automatic mode by default, with full-automatic available via settings
- Exposes two interfaces: a writer-friendly UI panel and a standalone CLI tool
- Extends via a Skills system for reusable, composable capabilities

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     User Interfaces                      │
│                                                         │
│   ┌───────────────────────┐   ┌─────────────────────┐  │
│   │   AI Panel (UI)       │   │  illusions-ai (CLI)  │  │
│   │   React component     │   │  packages/illusions- │  │
│   │   inside editor       │   │  ai-cli/  (Ink.js)   │  │
│   └──────────┬────────────┘   └──────────┬──────────┘  │
└──────────────┼──────────────────────────┼──────────────┘
               │                          │
               │         ┌────────────────┘
               │         │  Editor Bridge
               │         │  (Electron: local socket)
               │         │  (Web: UI panel only)
               ▼         ▼
┌─────────────────────────────────────────────────────────┐
│                  illusions-ai-core                       │
│              packages/illusions-ai-core/                 │
│                                                         │
│   ┌──────────────────────────────────────────────────┐  │
│   │                 Mastra Agent                      │  │
│   │   - Agent loop (plan → tool use → respond)       │  │
│   │   - Human-in-the-loop (suspend / resume)         │  │
│   │   - Skills registry                              │  │
│   │   - Conversation memory                          │  │
│   └──────────────────┬───────────────────────────────┘  │
│                      │                                   │
│          ┌───────────┼────────────────┐                  │
│          ▼           ▼                ▼                  │
│   ┌─────────┐  ┌──────────┐  ┌──────────────────┐       │
│   │ Tools   │  │ Skills   │  │ Provider Factory  │       │
│   └─────────┘  └──────────┘  └──────────────────┘       │
└─────────────────────────────────────────────────────────┘
               │                          │
               ▼                          ▼
     Electron IPC / VFS            Vercel AI SDK
     (file read/write)    (OpenAI / Anthropic / Google…)
```

---

## Core Package: `packages/illusions-ai-core/`

Shared between UI and CLI. Contains all agent logic, tools, and skills.

### Mastra Agent

The agent core is built on [Mastra](https://mastra.ai/) (Apache 2.0, TypeScript-first).

Mastra provides:

- **Agent loop**: Plan → tool selection → execution → respond
- **Tool system**: `createTool()` with Zod schemas for type-safe tool definitions
- **Workflow system**: Multi-step pipelines with sequential, parallel, and conditional branches
- **Human-in-the-loop**: `suspend()` / `resume()` API for approval gates
- **Skills**: Dynamic discovery and loading of reusable capability modules
- **Memory**: Conversation history and long-term context

### Provider Configuration

Multi-provider support via Mastra's integration with Vercel AI SDK:

```typescript
interface ProviderConfig {
  provider: "openai" | "anthropic" | "google" | "custom";
  apiKey: string;
  baseUrl?: string; // for custom / self-hosted endpoints
  modelId: string;
}
```

**Model selection hierarchy:**

1. Per-conversation override (user selects in UI or CLI flag)
2. Global default (set in Settings → AI)

### Tools (Novel-Specific)

All tools are defined with `createTool()` and Zod schemas:

| Tool                  | Description                     | Destructive                     |
| --------------------- | ------------------------------- | ------------------------------- |
| `read-mdi`            | Read a chapter or project file  | No                              |
| `write-mdi`           | Write changes back to a chapter | **Yes** — suspends in semi-auto |
| `search-characters`   | Query the character database    | No                              |
| `run-proofread`       | Run the existing linting system | No                              |
| `suggest-rewrite`     | Generate rewrite suggestions    | No                              |
| `extract-characters`  | Extract characters from text    | No                              |
| `list-chapters`       | List all chapters in a project  | No                              |
| `get-project-context` | Summarize the current project   | No                              |

Destructive tools (those that modify files) emit a `suspend()` in semi-automatic mode, requiring the user to approve before execution.

### Skills System

Skills are composable, reusable capability bundles — analogous to Claude Code skills.

```
packages/illusions-ai-core/skills/
  proofread/          ← built-in: full-chapter proofreading workflow
  character-sync/     ← built-in: extract and sync characters
  style-guide/        ← built-in: apply custom style rules
```

**Platform support:**

|                                  | Electron                  | Web |
| -------------------------------- | ------------------------- | --- |
| Built-in skills                  | ✅                        | ✅  |
| User-installed (local directory) | ✅ `~/.illusions/skills/` | ❌  |
| User-installed (file upload)     | ✅                        | ✅  |
| Official Skill Store (future)    | ✅                        | ✅  |

### Automation Modes

| Mode                     | Behavior                                | How to Enable                         |
| ------------------------ | --------------------------------------- | ------------------------------------- |
| Semi-automatic (default) | Destructive tools require user approval | Default                               |
| Full-automatic           | All tools execute without confirmation  | CLI: `--auto` flag / Settings: toggle |

---

## Interfaces

### UI Panel (inside illusions)

A new panel in the illusions editor, accessible from the sidebar or command palette.

**Features:**

- Chat interface (streaming responses)
- Task launcher: pre-built task buttons with custom UI per task type
  - Proofread chapter → shows diff view of suggestions
  - Extract characters → shows character card preview
  - Rewrite selection → shows before/after comparison
- Approval dialogs for destructive tool calls (semi-auto mode)
- Model selector (per-conversation override)
- Conversation history

**Platform:** Available on both Electron and Web.

### CLI (`packages/illusions-ai-cli/`)

A standalone CLI tool distributed separately.

```bash
# Interactive chat
illusions-ai chat

# Run a specific task
illusions-ai proofread chapter-01.mdi

# Full-automatic mode
illusions-ai --auto proofread chapter-01.mdi

# Select model for this session
illusions-ai --model claude-opus-4-5 chat
```

**Implementation:** Ink.js for terminal UI, same `illusions-ai-core` package for agent logic.

**Platform:** Desktop only (Electron users). Web users use the UI panel.

---

## Editor Bridge

The mechanism by which the CLI reads and writes the editor's current state.

### Electron

The Electron main process exposes a **local Unix socket** (named pipe on Windows):

```
~/.illusions/agent.sock   (macOS/Linux)
\\.\pipe\illusions-agent  (Windows)
```

Protocol: newline-delimited JSON over the socket.

Messages:

- `get-open-file` → returns the current file path and content
- `apply-edit` → applies a text edit to the open file (triggers normal save flow)
- `get-project-context` → returns project metadata

When the editor is not running, the CLI falls back to direct filesystem access via the VFS layer.

### Web

No CLI bridge. Web users interact exclusively through the UI panel.

---

## Relation to Existing `/lib/ai/`

The existing `IAiClient` interface and `ai-client.ts` will be partially refactored:

- **Keep**: `IAiClient` interface, `LintValidationResult`, `RewriteSuggestion`, `ExtractedCharacter`, `AiChatMessage` types — these map cleanly to Mastra tools
- **Refactor**: `AiClient` implementation — replace the direct OpenAI SDK calls with Mastra tool invocations
- **Keep**: `configureAiClient()` / `getAiClient()` singleton pattern — wire it to the Mastra provider factory
- **Deprecate**: `testAiConnection()` — replace with Mastra's built-in connection validation

Existing callers (linting L3 validation, rewrite suggestions, character extraction) continue to work through the same `IAiClient` interface without changes.

---

## Dependencies

| Package             | License    | Purpose                                 |
| ------------------- | ---------- | --------------------------------------- |
| `@mastra/core`      | Apache 2.0 | Agent loop, tools, skills, workflows    |
| `@mastra/ai-sdk`    | Apache 2.0 | Vercel AI SDK bridge                    |
| `@ai-sdk/openai`    | Apache 2.0 | OpenAI provider                         |
| `@ai-sdk/anthropic` | Apache 2.0 | Anthropic provider                      |
| `@ai-sdk/google`    | Apache 2.0 | Google provider                         |
| `ink`               | MIT        | CLI terminal UI                         |
| `zod`               | MIT        | Tool schema validation (already in use) |

Apache 2.0 is a permissive license compatible with this project's use case.

---

## File Structure

```
packages/
  illusions-ai-core/
    src/
      agent/
        agent.ts          ← Mastra agent configuration
        tools/            ← Novel-specific tool definitions
        skills/           ← Built-in skills
      providers/
        factory.ts        ← Provider factory (OpenAI / Anthropic / Google)
        config.ts         ← ProviderConfig type
      bridge/
        electron.ts       ← Unix socket client (used by CLI)
        types.ts          ← Bridge message protocol
    package.json

  illusions-ai-cli/
    src/
      index.ts            ← CLI entry point
      commands/
        chat.tsx          ← Interactive chat (Ink.js)
        proofread.tsx     ← Proofread command
      ui/                 ← Ink.js components
    package.json

lib/ai/
  types.ts                ← Keep (IAiClient interface, domain types)
  ai-client.ts            ← Refactor (wire to Mastra provider factory)
  providers/              ← New: thin provider config helpers

components/ai/            ← New: AI panel UI components
  AiPanel.tsx
  ChatView.tsx
  TaskLauncher.tsx
  ApprovalDialog.tsx
  ModelSelector.tsx

electron/ipc/
  ai-bridge-ipc.js        ← New: Unix socket server for CLI bridge
```

---

## Open Questions (to resolve during 1.3.0 planning)

1. **Socket lifecycle**: What happens when multiple Electron windows are open? One socket per window, or one global socket with window selection?
2. **Skill distribution**: How are official skills published and versioned?
3. **Conversation persistence**: Where are conversation histories stored — StorageService (SQLite/IndexedDB) or separate?
4. **CLI distribution**: Published to npm as `illusions-ai`, or bundled with the Electron installer?
