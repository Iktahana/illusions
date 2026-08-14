---
title: NLP バックエンド
slug: nlp-backend
type: architecture
status: active
updated: 2026-08-13
tags:
  - architecture
  - nlp
  - electron
---

# NLP Backend Architecture

illusions の形態素解析は Electron main process で実行し、renderer とは preload が公開する IPC だけで通信します。Web HTTP backend と browser transport は Web 版の終了に伴って撤去済みです。

## Architecture

```text
React / Next.js renderer
  └─ lib/nlp-client/nlp-client.ts
       └─ platform/electron-renderer/nlp-client.ts
            └─ window.electronAPI.nlp (preload)
                 └─ electron/ipc/nlp-ipc.js
                      └─ lib/nlp-backend/
                           ├─ nlp-processor.ts
                           └─ nlp-cache.ts
```

`getNlpClient()` は singleton の `ElectronNlpClient` を返します。module import 時には `window` を参照せず、実際の NLP operation を呼んだ時点で preload bridge を検証します。bridge がない場合は HTTP fallback を行わず、設定不備が分かるエラーを返します。

## IPC surface

- `nlp:init`: tokenizer を初期化する
- `nlp:tokenize-paragraph`: 単一段落を解析する
- `nlp:tokenize-document`: 複数段落を batch 解析し、進捗を通知する
- `nlp:analyze-word-frequency`: 文書全体の語彙頻度を解析する

renderer 側の public interface は `lib/nlp-client/types.ts` の `INlpClient` です。UI と editor plugin は Electron IPC の詳細ではなく、この interface と `getNlpClient()` に依存します。

## Runtime behavior

- Kuromoji dictionary は main process で初回利用時に遅延初期化します。
- processor と LRU cache は main process 内で共有されます。
- renderer の処理は Promise-based で、長文の batch 処理では progress callback を利用できます。
- `public/dict/` は packaged Electron app が参照する runtime asset のため、Web 配信終了後も削除しません。

## Usage

```typescript
import { getNlpClient } from "@/lib/nlp-client/nlp-client";

const nlpClient = getNlpClient();
const tokens = await nlpClient.tokenizeParagraph("これはテストです。");
```

## Troubleshooting

### `Electron NLP API is unavailable`

`window.electronAPI.nlp` が preload から公開されていません。`electron/preload.js` の公開 API と `electron/ipc/nlp-ipc.js` の handler 登録を確認します。HTTP endpoint への fallback はありません。

### 初回解析が遅い

dictionary の初期化には時間がかかります。2 回目以降は main process の processor と cache が再利用されます。

### Token の型が一致しない

`Token`、`WordEntry`、`TokenizeProgress` は `@/lib/nlp-client/types` から import します。

## Related files

- `lib/nlp-client/nlp-client.ts`: renderer 向け singleton factory
- `lib/nlp-client/types.ts`: renderer と adapter の共通 contract
- `platform/electron-renderer/nlp-client.ts`: preload IPC adapter
- `electron/ipc/nlp-ipc.js`: main process IPC handlers
- `lib/nlp-backend/`: tokenizer、batch processing、cache
