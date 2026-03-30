# milkdown-plugin-japanese-novel

Milkdown plugin for Japanese novel writing: vertical writing, Ruby, tate-chu-yoko, and manuscript-style layout.

## Features

- **Vertical writing (縦書き)**: `writing-mode: vertical-rl`, optimized for Japanese text.
- **Ruby (振仮名)**: `{漢字|かんじ}` renders as `<ruby><rb>漢字</rb><rt>かんじ</rt></ruby>`.
- **Tate-chu-yoko (縦中横)**: Digits and repeated punctuation (e.g. `10`, `!!`) are displayed horizontally in vertical mode.
- **Manuscript style (原稿用紙)**: Optional 20×20 grid background.
- **Manuscript count**: Character count and 400字詰 manuscript page estimate.

## Installation

```bash
npm install milkdown-plugin-japanese-novel
```

## Usage

```ts
import { Editor, rootCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { japaneseNovel } from "milkdown-plugin-japanese-novel";
import "milkdown-plugin-japanese-novel/style.css";

Editor.make()
  .config((ctx) => {
    ctx.set(rootCtx, root);
  })
  .use(commonmark)
  .use(
    japaneseNovel({
      isVertical: true,
      showManuscriptLine: false,
      enableRuby: true,
      enableTcy: true,
    }),
  );
```

## Options

| Option               | Type      | Default | Description                                  |
| -------------------- | --------- | ------- | -------------------------------------------- |
| `isVertical`         | `boolean` | `false` | Enable vertical writing mode.                |
| `showManuscriptLine` | `boolean` | `false` | Show manuscript-style grid.                  |
| `enableRuby`         | `boolean` | `true`  | Enable `{base\|ruby}` syntax.                |
| `enableTcy`          | `boolean` | `true`  | Enable tate-chu-yoko for digits/punctuation. |

## Syntax

- **Ruby**: `それは{運命|さだめ}だった。` → base “運命” with ruby “さだめ”.

## License

MIT
