# Proofreading, dictionary, and NLP

```mermaid
flowchart TD
  Page["Lint orchestration<br/>app/page.tsx:1084"] --> Hook["Lint lifecycle<br/>lib/editor-page/use-linting.ts:1"]
  Hook --> Loader["External ruleset coordinator<br/>lib/linting/external-ruleset-loader.ts:60"]
  Loader --> Proxy["Worker proxy load/unload<br/>packages/milkdown-plugin-japanese-novel/linting-plugin/worker/rule-runner-proxy.ts:268"]
  Proxy --> Worker["Ruleset worker<br/>packages/milkdown-plugin-japanese-novel/linting-plugin/worker/linting.worker.ts:175"]
  Worker --> Registry["Manifest/requirement registry<br/>lib/linting/registry/ruleset-registry.ts:101"]
  Registry --> SDK["Module/context contract<br/>lib/linting/sdk/ruleset-types.ts:133"]
  Registry --> Toolkit["NFKC/dedupe/dict tools<br/>lib/linting/toolkit/index.ts:20"]
  Proxy --> Runner["Legacy rule engine<br/>lib/linting/rule-runner.ts:1"]
  Runner --> Rules["Legacy rules and presets<br/>lib/linting/rule-registry.ts:1"]
  Runner --> NLP["NLP client facade<br/>lib/nlp-client/nlp-client.ts:1"]
  NLP --> Web["HTTP adapter<br/>lib/nlp-client/web-nlp-client.ts:1"]
  NLP --> Electron["IPC adapter<br/>lib/nlp-client/electron-nlp-client.ts:1"]
  Runner --> Dict["Dictionary access facade<br/>lib/dict/dict-access.ts:1"]
  Dict --> Inspector["Correction/dictionary UI<br/>components/inspector/CorrectionsPanel.tsx:1"]
  Settings["Ruleset settings UI<br/>components/settings/linting/RulesetList.tsx:41"] --> MainApi["Integrity-checked module API<br/>electron/rulesets-manager.js:289"]
  MainApi --> Loader
```

External dependencies: project settings, ignored corrections, Electron IPC, Next API routes. This diagram reflects merged PR #1795 at `c183966`. Dictionary-backed rules must retain the documented not-ready fail-safe.
