# Lint Rule Execution → Web Worker Parallelization

**Date**: 2026-05-05 (revised 2026-05-06 after Codex review iteration 1)
**Branch**: `feature/lint-worker-parallelization`
**Targets**: `dev`

## Context

Toggling the proofreading panel on long Japanese novels (1000+ paragraphs in
the "原稿/缶詰" Google Drive project) freezes the editor for several seconds.
During the freeze the cursor cannot be placed and keystrokes are queued.

Root cause is in
`packages/milkdown-plugin-japanese-novel/linting-plugin/decoration-plugin.ts`,
function `scheduleViewportUpdate` (L217–394):

- The function is misnamed — it processes the **entire document**, not just
  the viewport (L228–232). The original viewport-only design was abandoned
  to avoid scroll jitter.
- Per-paragraph `RuleRunner.runAll` / `runAllWithTokens` (L262, L267, L270)
  and document-level `runDocument*` (L310, L313, L318) execute synchronously
  on the renderer main thread. The current registry has ~21 JTF L1 regex
  rules + ~1 manuscript + ~1 NIH-style ruleset (`createJsonDrivenRules` at
  `lib/linting/rule-registry.ts:17`).
- `DecorationSet.create(...)` (L386) and `view.dispatch(tr)` (L389) also
  run synchronously.

For a 100k-character novel the cumulative blocking time exceeds 5 seconds —
ProseMirror cannot deliver pointer/keyboard events while the main thread is
busy.

## Goal

Move `RuleRunner` execution off the renderer main thread by hosting it
inside a **dedicated module-mode Web Worker**. The main thread keeps
tokenization (already async via Electron IPC / `/api/nlp` HTTP) and
decoration construction. After the change, toggling proofreading on a long
document must keep the cursor responsive (typing latency p95 < 100ms during
the initial scan).

## Architecture

```
Renderer main thread                            Web Worker
─────────────────────────                       ─────────────────────
useLinting / decoration-plugin
  │
  ├─ tokenize via electronAPI / fetch
  │   (Electron IPC or /api/nlp)        ──┐
  │                                       │ no Worker access to electronAPI
  │                                       │ (decision: keep both paths on main)
  │                                       │
  └─ RuleRunnerProxy.runBatch(req)  ──postMessage──→  RuleRunner
                                    ←──postMessage──   .runAll* / .runDocument*
                                                       returns Issue[]
```

### Key decisions

1. **Single dedicated Worker, not a pool.** Rule runs are short and we need
   ordered, batched results. A pool adds serialization overhead without
   throughput gains for this workload.
2. **Tokenization stays on the main thread.** `electron-nlp-client.ts` uses
   `window.electronAPI.nlp.*` (preload-bound, unreachable from a Worker).
   `web-nlp-client.ts` uses `fetch('/api/nlp/...')` and **could** be invoked
   from a Worker, but moving it provides no benefit for this fix and would
   diverge the two clients. Kept on main thread for parity / minimal scope.
3. **Batched RPC, not per-paragraph postMessage.** Sending 1000 messages
   thrashes the structured-clone path. One `RUN_BATCH` request carries all
   paragraphs.
4. **Capability flags computed on the main thread.** `hasMorphologicalRules()`
   and `hasDocumentRules()` are queried synchronously by both
   `decoration-plugin.ts` and `use-linting.ts:123`. We cannot make those
   async without a wider refactor. Solution: the proxy imports the rule
   registry on the main thread and computes the flags from rule **metadata
   only** (`rule.engine`, `isDocumentLintRule` type guard). The actual
   `lint()` work is delegated to the worker; only metadata reads happen on
   the main thread.
5. **Module-mode Worker via `new URL(..., import.meta.url)`.** Next.js 16
   Turbopack and Webpack 5 both bundle this natively — no `worker-loader`,
   no `next.config.ts` changes. Confirmed:
   - `tsconfig.json` already lists `"webworker"` in `lib`.
   - `next.config.ts` has no Worker-specific blockers.
   - Electron CSP allows `worker-src 'self' blob:` (`electron/main.js`).
   - `bundle:electron` only bundles main/preload (`scripts/bundle-electron.mjs`),
     so the renderer is untouched standard Next output (dev:
     `http://localhost:3020`, prod: `out/index.html` via
     `electron/window-manager.js`).
6. **State-driven proxy readiness.** The worker is created lazily in a
   `useEffect` after `useLinting` mounts (so SSR doesn't choke on
   `Worker`). The proxy is held in **React state** (not just a ref) so its
   transition `null → ready` triggers a rerender, propagating into
   `EditorLayout` → `Editor` → `MilkdownEditor` → linting plugin via
   `updateLintingSettings({ ruleRunner })`. Holding only a ref would leave
   the editor stuck with `null`.
7. **`RuleRunnerLike` is the plugin-path interface.** `useLinting`, the
   editor components, and the linting plugin switch their type from
   `RuleRunner` (concrete class) to a new `RuleRunnerLike` interface that
   adds `runBatch(...)` async + `dispose()` to the existing sync metadata
   methods. The proxy is the only `RuleRunnerLike` implementation
   introduced here. The concrete `RuleRunner` class is retained
   unchanged inside the worker and for any non-plugin call sites (e.g.
   future unit tests that exercise rules directly without a Worker); it
   is not expected to satisfy `RuleRunnerLike`.
8. **Cancellation has three modes:**
   - **Stale-by-version**: `processingVersion` is sent inside each
     `RUN_BATCH`. The proxy compares the response's version to the
     proxy's "latest accepted" version; mismatches reject the awaited
     promise with `WorkerStaleError`. Callers in `decoration-plugin.ts`
     catch this and silently drop the result (no cache write, no
     `view.dispatch(...)`).
   - **Lint-disabled mid-flight**: when `enabled` flips to `false`, the
     proxy's `cancelInFlight()` is called from the
     `decoration-plugin.ts` `apply()` path; pending requests reject
     with `WorkerStaleError`.
   - **Disposed**: `proxy.dispose()` (called from the `useLinting`
     unmount cleanup) terminates the worker and rejects all pending
     requests with `WorkerDisposedError`.

   Both errors are silent-cancel sentinels — the catch block in
   `decoration-plugin.ts` swallows them. Any other error is surfaced
   via `notificationManager.warning(...)` and aborts the current
   pass.

   In addition to the proxy-side guards, `decoration-plugin.ts` keeps
   explicit caller-side `version === processingVersion` checks
   immediately after every `await` and before any cache write or
   `view.dispatch(...)`. The proxy-side filtering removes the bulk of
   stale work; the caller-side check is a belt-and-braces guard
   against ordering races between proxy state and plugin state.

9. **Hybrid L1/L2 split (post-PR-1425 reality).** PR #1425 reintroduced
   one L2 morphological rule (`GenjiUnknownNounRule`) plus
   `lib/dict/genji-vocab.ts` and `dict.onInstalled`. `genjiVocab` reads
   from `window.electronAPI.dict.listNounHeadwords` — unreachable from a
   Worker. To keep the implementation tonight-shippable:
   - **Worker registers only non-morphological rules.** That is the
     three JSON L1 rule sets (`createJtfL1Rules` +
     `createManuscriptL1Rules` + `createNihongoHyoukiL1Rules`) — ~21
     regex rules covering ~90%+ of the per-paragraph CPU cost on long
     documents.
   - **Main thread keeps a small synchronous `RuleRunner` populated
     only with morphological rules** (currently just
     `GenjiUnknownNounRule`). It is invoked **after** tokenization and
     in a tight loop over paragraphs — but it's a single rule with a
     hash-set lookup per token, so the per-paragraph cost is
     micro-second-scale and does not freeze the editor.
   - **`decoration-plugin.ts` merges** the issues returned by the
     Worker batch and the main-thread morph runner. Both contribute
     to the same `issueCache` (per-paragraph) / `documentIssueCache`
     (document-level) keyed by paragraph text / index.
   - **Vocab DI / replication is out of scope.** Captured as a future
     follow-up; if the L2 rule list grows or its CPU cost becomes
     visible, we revisit moving morph rules into the worker with
     vocab replication.

## Tech stack

- TypeScript (strict, `lib` already includes `webworker`)
- Native ES module Web Worker (`type: "module"`)
- Existing test runner: Vitest
- No new dependencies (no Comlink — the typed RPC layer is small enough to
  hand-roll)

## Files

### New

- `packages/milkdown-plugin-japanese-novel/linting-plugin/worker/protocol.ts`
  — typed request/response message contracts; `RuleRunnerLike` interface.
- `packages/milkdown-plugin-japanese-novel/linting-plugin/worker/linting.worker.ts`
  — Worker entry point. Constructs a private `RuleRunner`, registers
  `getAllRules()` + `createJsonDrivenRules()`, calls
  `setGuidelineMap(RULE_GUIDELINE_MAP)`. Posts a `READY` message on init.
- `packages/milkdown-plugin-japanese-novel/linting-plugin/worker/rule-runner-proxy.ts`
  — main-thread `RuleRunnerLike` implementation. Owns the `Worker` instance,
  correlation IDs, pending-request map, capability flags, version-aware
  cancellation, `WorkerDisposedError`.
- `packages/milkdown-plugin-japanese-novel/linting-plugin/worker/__tests__/proxy.test.ts`
  — Vitest test that mocks `globalThis.Worker` and exercises the proxy:
  `runBatch` round-trip via fake post-message, version filtering,
  `cancelInFlight`, and dispose-before-READY. (No separate
  `handle-message.ts` extraction — kept for a future iteration if
  test friction grows.)

### Modified

- `lib/editor-page/use-linting.ts` — return type changes to `ruleRunner:
RuleRunnerLike | null`. The runner is built in a `useEffect` and stored
  in state; on unmount, `proxy.dispose()` is called. Capability checks
  (`hasMorphologicalRules()`) keep their sync signature — they read the
  proxy's main-thread metadata cache.
- `packages/milkdown-plugin-japanese-novel/linting-plugin/types.ts`
  — `LintingPluginOptions.ruleRunner` and `LintingSettingsUpdate.ruleRunner`
  switch from `RuleRunner | null` to `RuleRunnerLike | null`.
- `packages/milkdown-plugin-japanese-novel/linting-plugin/index.ts`
  — `LintingOptions.ruleRunner` switches from `RuleRunner | null` to
  `RuleRunnerLike | null` so callers can pass the proxy.
- `packages/milkdown-plugin-japanese-novel/linting-plugin/decoration-plugin.ts`
  — change the `currentRuleRunner` type. Replace the per-paragraph
  `for…of` loop (L242–273) with a single `runner.runBatch({ paragraphs:
uncached, mode: "per-paragraph", version })` call and merge results into
  `issueCache`. Replace the document-rules block (L281–322) with the same
  call carrying `mode: "both"` (or a separate call with `mode: "document"`)
  to halve the round-trips. Wrap each `await` in a `try/catch` that drops
  `WorkerDisposedError` silently and surfaces other errors via
  `notificationManager.warning(...)`.
- `components/EditorLayout.tsx` — `mainArea.ruleRunner` type changes from
  `RuleRunner` to `RuleRunnerLike | null`; the `<Editor>` prop forwarding
  is null-safe already (`Editor.tsx` declares `lintingRuleRunner?:
RuleRunner | null` — switch to `RuleRunnerLike | null`).
- `components/Editor.tsx` — `lintingRuleRunner` prop type updated to
  `RuleRunnerLike | null`.
- `components/editor/MilkdownEditor.tsx` — same prop type update; the
  forwarding into `updateLintingSettings({ ruleRunner: lintingRuleRunner })`
  is unchanged in shape.
- `app/page.tsx` — destructure consumes `ruleRunner: RuleRunnerLike | null`;
  type widens automatically.

### Reused (do not modify)

- `lib/linting/rule-runner.ts` — runs unchanged inside the Worker.
- `lib/linting/rule-registry.ts` — imported by both the worker
  (registration) and the proxy (metadata).
- `lib/linting/rules/json-l1/*.ts` — pure logic, no DOM/IPC.
- `lib/nlp-client/*` — tokenization stays on the main thread.

## Tasks

### Task 1 — Protocol & RuleRunnerLike

- [ ] Create `worker/protocol.ts`.
- [ ] Define `RuleRunnerLike`:
      `ts
interface RuleRunnerLike {
  setConfig(id: string, cfg: LintRuleConfig): void;
  setActiveGuidelines(g: string[] | null): void;
  setGuidelineMap(m: Map<string, string | undefined>): void;
  hasMorphologicalRules(): boolean;
  hasDocumentRules(): boolean;
  runBatch(req: RunBatchRequest): Promise<RunBatchResponse>;
  cancelInFlight(): void;
  dispose(): void;
}
`
- [ ] Define the message protocol as **two** discriminated unions: - `WorkerRequest` (main → worker): all variants carry
      `correlationId: number`. Variants: `SET_GUIDELINE_MAP`,
      `SET_ACTIVE_GUIDELINES`, `SET_CONFIG`, `RUN_BATCH` (also carries
      `version: number`). - `WorkerEvent` (worker → main) is a tagged union of: - `{ type: "READY" }` — out-of-band, no `correlationId`. - `{ type: "RESPONSE", correlationId, payload }` — reply to a
      specific request. `RUN_BATCH` responses carry `version` so the
      proxy can apply stale-by-version filtering before resolving. - `{ type: "ERROR", correlationId?, error: { name, message } }`
      — `correlationId` is optional because uncaught worker errors
      may not be associated with a specific request.
- [ ] Define `WorkerDisposedError extends Error` and
      `WorkerStaleError extends Error`. Both are silent-cancel sentinels
      (callers swallow them; only "real" errors surface via the
      notification manager).

### Task 2 — Worker entry point

- [ ] Create `worker/linting.worker.ts`. Top-level: build a `RuleRunner`,
      register `getAllRules()` + `createJsonDrivenRules()`, call
      `setGuidelineMap(RULE_GUIDELINE_MAP)`.
- [ ] Wire `self.onmessage = (e) => { ...switch on e.data.type ...
self.postMessage({ type: "RESPONSE", correlationId, payload }); }`.
      Catch any rule-execution error per request and post
      `{ type: "ERROR", correlationId, error: { name, message } }`
      instead. An uncaught top-level throw becomes
      `{ type: "ERROR", error }` (no correlationId).
- [ ] After the registry is wired, post `{ type: "READY" }` once.

### Task 3 — RuleRunnerProxy

- [ ] Create `worker/rule-runner-proxy.ts`. Implements `RuleRunnerLike`.
- [ ] Constructor: imports the rule registry **statically**, builds an
      array of rule metadata `{ id, engine, kind: "doc" | "para" }`.
      Capability flags `hasMorphologicalRules()` / `hasDocumentRules()`
      read from this metadata cache (no async needed).
- [ ] **Readiness**: hold a private `readyPromise: Promise<void>` that
      resolves when the worker posts `{ type: "READY" }`. Until READY: - `setConfig` / `setActiveGuidelines` / `setGuidelineMap` calls
      enqueue messages in a private buffer; the buffer flushes (in
      FIFO order) immediately after `readyPromise` resolves. - `runBatch` calls `await readyPromise` first, then post. - If `dispose()` is called before READY: terminate the worker,
      clear the buffer, reject any pending `runBatch` promises with
      `WorkerDisposedError`. The `readyPromise` itself rejects with
      `WorkerDisposedError` so any concurrent `runBatch` awaiting it
      unwinds cleanly.
- [ ] `runBatch`: increments correlation ID, captures the current
      `version` from the request, posts the message, returns a Promise
      tracked in a `pendingRequests` map.
- [ ] **Stale-by-version filtering**: the proxy tracks
      `latestAcceptedVersion`. On every fresh `runBatch(req)` the
      proxy updates `latestAcceptedVersion = req.version`. When a
      `RESPONSE` arrives, if `response.version < latestAcceptedVersion`,
      the matching entry rejects with `WorkerStaleError` instead of
      resolving.
- [ ] `cancelInFlight()`: rejects every entry in `pendingRequests` with
      `WorkerStaleError` and clears the map. The worker keeps running;
      next `runBatch` proceeds normally.
- [ ] `dispose()`: terminates the worker, rejects all pending requests
      with `WorkerDisposedError`, marks the proxy disposed (subsequent
      method calls throw or no-op).
- [ ] On worker `error` / `messageerror` event: reject all pending
      requests with the underlying error (not a sentinel) — this is a
      real failure, surface it.
- [ ] Unknown correlation IDs (e.g. response arriving after
      `cancelInFlight`) are silently dropped — they may belong to
      already-rejected entries.

### Task 4 — Wire useLinting

- [ ] Replace the synchronous lazy `RuleRunner` construction with:
      `ts
const [ruleRunner, setRuleRunner] = useState<RuleRunnerLike | null>(null);
useEffect(() => {
  if (typeof window === "undefined") return;
  const proxy = new RuleRunnerProxy();
  proxy.setGuidelineMap(RULE_GUIDELINE_MAP);
  setRuleRunner(proxy);
  return () => proxy.dispose();
}, []);
`
- [ ] Keep the existing `lintingRuleConfigs` sync `useEffect` and the
      `correctionGuidelines` sync `useEffect` — they call sync setters
      that the proxy forwards as fire-and-forget messages.
- [ ] `refreshLinting`: gate on `ruleRunner != null`; when null, no-op.
- [ ] Return type becomes `ruleRunner: RuleRunnerLike | null`.

### Task 5 — Wire decoration-plugin

- [ ] Change `currentRuleRunner` type to `RuleRunnerLike | null`.
- [ ] Replace L242–273 (per-paragraph loop) with a **single**
      `await runner.runBatch({ paragraphs: uncached, mode: "per-paragraph",
version })` call. Result populates `issueCache` for each
      paragraph text.
- [ ] Replace L281–322 (document rules block) with a single
      `await runner.runBatch({ paragraphs: allParagraphs, mode: "document",
version })` call when `runner.hasDocumentRules()` is true.
      (Preserve token shape: paragraphs carry `tokens?` only when
      `runner.hasMorphologicalRules() && nlp` — current registry has none,
      so this branch is dead in practice but kept for forward-compat.)
- [ ] Wrap both `await` calls in `try/catch`. Drop `WorkerStaleError`
      and `WorkerDisposedError` silently (no cache write, no dispatch).
      Surface other errors through `notificationManager.warning(...)`
      and bail out of the current pass.
- [ ] **Keep the explicit caller-side guards.** Immediately after every
      `await`, before any cache write or `view.dispatch(...)`, re-check
      `version === processingVersion` and re-read the plugin's
      `enabled` state via `lintingKey.getState(view.state)?.enabled`.
      Bail out if either check fails. (The proxy filters most stale
      responses, but ordering races between proxy state and plugin
      state are still possible — this is a belt-and-braces guard.)
- [ ] **Lint-disable cancellation**: in the `apply()` switch, when
      `meta.enabled === false` is observed, call
      `currentRuleRunner?.cancelInFlight()` so any in-flight batch
      stops without dispatching stale decorations.
- [ ] **Manual-refresh / mode-change cancellation**: the existing
      `pendingFullScan = true` path already invalidates caches; also
      call `currentRuleRunner?.cancelInFlight()` in those branches so
      the queued post-await work doesn't dispatch stale decorations
      from the previous configuration.

### Task 6 — Type plumbing

- [ ] Update `linting-plugin/types.ts` to use `RuleRunnerLike | null`
      throughout (`LintingPluginOptions`, `LintingSettingsUpdate`).
- [ ] Update `linting-plugin/index.ts`: `LintingOptions.ruleRunner`
      → `RuleRunnerLike | null`. (Without this, callers passing the
      proxy into `linting(...)` get a TypeScript mismatch.)
- [ ] Update `components/EditorLayout.tsx` `mainArea.ruleRunner` type to
      `RuleRunnerLike | null`. The downstream `<Editor>` prop type already
      tolerates `null`; switch its type alias too.
- [ ] Update `components/Editor.tsx` and
      `components/editor/MilkdownEditor.tsx` `lintingRuleRunner` props to
      `RuleRunnerLike | null`.
- [ ] `app/page.tsx`: no logic change, but the destructured `ruleRunner`
      type widens automatically.

### Task 7 — Tests

- [ ] `worker/__tests__/proxy.test.ts` (mocking `globalThis.Worker`): - `runBatch` round-trip: post a `RUN_BATCH`, simulate a
      `RESPONSE`, assert the awaiter resolves with the parsed payload. - Version filtering: response with `version` lower than the
      proxy's latest accepted version rejects with `WorkerStaleError`. - `cancelInFlight()` rejects all pending with `WorkerStaleError`,
      leaves the worker running, next `runBatch` succeeds. - `dispose()` before READY: pending requests reject with
      `WorkerDisposedError`; the buffered config messages are not
      flushed (worker terminated).
- [ ] `lib/editor-page/__tests__/use-linting.worker.test.ts`: - Mock `globalThis.Worker`; assert proxy creation on mount,
      `dispose()` on unmount, capability flags reflect registry
      contents (currently `hasMorphologicalRules() === false`,
      `hasDocumentRules()` true iff any registered JSON L1 rule is a
      DocumentLintRule — read from registry metadata at construction).

### Task 8 — Manual verification

1. `npm run electron:dev`.
2. Open the "缶詰" project (long Google-Drive-hosted novel).
3. Toggle the proofreading panel on.
4. While decorations are being computed, type into the editor — cursor
   must remain responsive (no observable freeze longer than ~100ms).
5. Confirm decorations appear within ~1–2s and match the previous
   (pre-worker) output for the first 5 paragraphs.
6. Toggle the panel off and on a second time; confirm caches clear and
   the second run is faster (warm token cache — n/a today, but no
   regression).
7. Activity Monitor: Electron Helper (Renderer) main thread should peak
   briefly but not pin at 100% CPU; the new worker thread carries the
   load.
8. `npm run electron:build` (or equivalent) and smoke-test the packaged
   build to confirm the Worker bundle is included.

## Out of scope

- Tokenization off the main thread (kuromoji stays on Electron main /
  Next.js API).
- Worker pool / sharding.
- Genji-vocab DI or any L2 rule introduction.
- The unrelated B1/B2/B3 ENOENT/dialog issues tracked in
  `2026-05-03-fix-page-unresponsive-on-open.md`.

## Risks & mitigations

- **Risk**: Worker construction races with first lint call.
  - **Mitigation**: Proxy queues `setConfig` / `setActiveGuidelines`
    messages until the worker posts `READY`. `runBatch` calls also wait
    on the same readiness promise.
- **Risk**: The `processingVersion` cancellation no longer fires per
  paragraph, only per batch.
  - **Mitigation**: Versions are sent inside each `RUN_BATCH`; stale
    responses are dropped before `issueCache` writes or
    `view.dispatch(...)`. (Codex confirmed this is adequate.)
- **Risk**: `structuredClone` on a single `RUN_BATCH` could itself block.
  - **Mitigation**: With the current registry (regex-only L1, no token
    payload), realistic batch size is ~few-hundred KB of text — safe.
    If L2 rules return later and tokens make payloads multi-MB, chunk by
    paragraph count (e.g. 200/batch). Captured as a follow-up.
- **Risk**: Unhandled promise rejections during editor unmount /
  re-toggle.
  - **Mitigation**: `WorkerDisposedError` is treated as silent cancel in
    `decoration-plugin.ts`; all `await` sites have `try/catch`.
- **Risk**: SSR explosion from `Worker` reference at import time.
  - **Mitigation**: Worker is constructed inside `useEffect`, so the
    module path is reachable but the constructor is not invoked during
    SSR. The proxy's static metadata import is browser-safe (pure data).

## Review history

### Iteration 1 — Codex review (2026-05-05)

Codex returned **NEEDS_REVISION** with 4 actionable findings (R1
CRITICAL, R2/R3/R4 IMPORTANT) and 1 wording suggestion (R5).

**Accepted**

- **R1**: Removed all Genji-vocab / `genji-unknown-noun.ts` references.
  Verified: `lib/dict/genji-vocab.ts` does not exist in dev,
  `lib/linting/rules/l2/` is empty, `getAllRules()` returns `[]` at
  `rule-registry.ts:11`, and the preload `dict.*` API has no
  `onInstalled`. Architecture decision 4 deleted; original Task 4
  collapsed into the protocol/proxy tasks.
- **R2**: Replaced "lazy ref" with state-driven readiness (Architecture
  decision 6). Added `EditorLayout.tsx`, `Editor.tsx`, `MilkdownEditor.tsx`,
  `linting-plugin/types.ts`, and `app/page.tsx` to the modified-files
  list. New Task 6 covers the type plumbing.
- **R3**: Capability flags are computed synchronously on the main
  thread from rule metadata (`engine` field, `isDocumentLintRule` type
  guard). The proxy reads its metadata cache; no round-trip needed.
  Recorded in Architecture decision 4 (renumbered).
- **R4**: Added `WorkerDisposedError` sentinel. `decoration-plugin.ts`
  wraps each awaited `runBatch` call in `try/catch` and treats the
  sentinel as silent cancel; other errors surface via
  `notificationManager.warning(...)`. Captured in Architecture decision
  8 and Task 5.

**Adjusted (partial)**

- **R5**: Reworded the NLP scope decision (Architecture decision 2).
  We don't claim `web-nlp-client.ts` is unreachable from a Worker; we
  state that keeping both NLP paths on the main thread is a deliberate
  scope choice for parity / minimal surface change.

**Confirmed (no change needed)**

- A: Worker creation is viable in this Next 16 + Turbopack + Electron
  setup (CSP + tsconfig + bundle script verified).
- B: version-in-payload is adequate for cancellation.
- D: structured-clone size is safe today; chunking captured as a
  forward-compat risk only.
- F: `typeof window` check is sufficient given state-driven readiness.

### Iteration 2 — Codex re-review (2026-05-06)

Codex returned **NEEDS_REVISION** with 2 IMPORTANT findings (R6, R7)
and 1 SUGGESTION (R8). All R1–R4 fixes were verified correct.

**Accepted**

- **R6**: Reshaped the protocol into `WorkerRequest` (always carries
  `correlationId`) and `WorkerEvent` (tagged union: `READY` without
  `correlationId`, `RESPONSE`, `ERROR`). Added explicit Task 3
  bullets for `readyPromise`, message buffer flushing on READY, and
  dispose-before-READY behavior (worker terminated, buffer cleared,
  pending requests rejected, `readyPromise` itself rejects with
  `WorkerDisposedError`).
- **R7**: Introduced `WorkerStaleError` as a separate sentinel from
  `WorkerDisposedError`. Stale responses (version mismatch) and
  in-flight cancellations both reject with `WorkerStaleError`.
  Caller-side `version === processingVersion` guards are
  **preserved** post-await (belt-and-braces against proxy/plugin
  ordering races). Added `proxy.cancelInFlight()` and wired it into
  `decoration-plugin.ts` `apply()` for `enabled=false`,
  manual-refresh, and mode-change paths.

**Adjusted (partial)**

- **R8**: Reworded Architecture decision 7. The plan no longer claims
  `RuleRunner` "satisfies" `RuleRunnerLike`; it states explicitly that
  the proxy is the only `RuleRunnerLike` impl in the plugin path, and
  that the concrete `RuleRunner` is retained inside the worker and for
  non-plugin call sites without the new methods.

### Iteration 3 — Codex final review (2026-05-06)

Codex confirmed R6/R7/R8 are properly addressed and the plan is
implementable. Returned **NEEDS_REVISION** with one remaining
IMPORTANT finding:

**Accepted**

- **R9** (IMPORTANT): Added
  `packages/milkdown-plugin-japanese-novel/linting-plugin/index.ts`
  to the modified-files list and to Task 6. Without this, callers
  passing the proxy into `linting(...)` would hit a TypeScript
  mismatch because `LintingOptions.ruleRunner` was still typed as
  `RuleRunner | null`.

**Trimmed for YAGNI (per Codex's "safe to drop" hint)**

- Dropped the separate `worker/handle-message.ts` extraction. The
  worker entry point now wires `self.onmessage` directly. The
  protocol unit test is replaced by a proxy-side test (`proxy.test.ts`)
  that mocks `globalThis.Worker` — it covers `runBatch`, version
  filtering, `cancelInFlight`, and dispose-before-READY without
  needing the extra extraction.
