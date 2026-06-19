# Proofreading, dictionary, and NLP

```mermaid
flowchart TD
  Page["Lint orchestration<br/>app/page.tsx:1084"] --> Hook["Lint lifecycle<br/>lib/editor-page/use-linting.ts:1"]
  Hook --> Proxy["Worker proxy<br/>packages/milkdown-plugin-japanese-novel/linting-plugin/worker/rule-runner-proxy.ts:10"]
  Proxy --> Runner["Rule engine<br/>lib/linting/rule-runner.ts:1"]
  Proxy --> Worker["Regex-rule worker<br/>packages/milkdown-plugin-japanese-novel/linting-plugin/worker/linting.worker.ts:13"]
  Runner --> Rules["Rules and presets<br/>lib/linting/rule-registry.ts:1"]
  Runner --> NLP["NLP client facade<br/>lib/nlp-client/nlp-client.ts:1"]
  NLP --> Web["HTTP adapter<br/>lib/nlp-client/web-nlp-client.ts:1"]
  NLP --> Electron["IPC adapter<br/>lib/nlp-client/electron-nlp-client.ts:1"]
  Runner --> Dict["Dictionary access facade<br/>lib/dict/dict-access.ts:1"]
  Dict --> Inspector["Correction/dictionary UI<br/>components/inspector/CorrectionsPanel.tsx:1"]
```

External dependencies: project settings, ignored corrections, Electron IPC, Next API routes. Dictionary-backed rules must retain the documented not-ready fail-safe.
