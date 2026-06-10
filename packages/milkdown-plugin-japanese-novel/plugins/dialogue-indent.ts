import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import type { Node } from "@milkdown/prose/model";

/**
 * 行頭の起こし括弧。これらで始まる段落（会話文など）は
 * 日本語小説組版の慣例に従い字下げしない。
 */
const OPENING_BRACKETS = new Set(["「", "『", "（", "〈", "《", "【", "〔", "“", "‘"]);

/**
 * 段落の見た目上の先頭文字を返す。
 * 先頭がルビの場合は親文字（base）の先頭を見る。
 */
export function getParagraphLeadingChar(node: Node): string {
  const first = node.firstChild;
  if (!first) return "";
  if (first.isText) return first.text?.charAt(0) ?? "";
  if (first.type.name === "ruby") {
    return ((first.attrs.base as string) ?? "").charAt(0);
  }
  return "";
}

/**
 * 起こし括弧で始まる段落（= 字下げ対象外）かどうか。
 */
export function isDialogueParagraph(node: Node): boolean {
  return OPENING_BRACKETS.has(getParagraphLeadingChar(node));
}

/**
 * 起こし括弧で始まる段落に `mdi-dialogue` クラスを付与する
 * デコレーションプラグイン。CSS 側で `text-indent: 0` を適用し、
 * 会話文の行頭を天付きにする。ドキュメント内容は変更しない。
 */
export function createDialogueIndentPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey("dialogueIndent"),
    props: {
      decorations(state) {
        const decorations: Decoration[] = [];

        state.doc.descendants((node: Node, pos: number) => {
          if (node.type.name !== "paragraph") return;
          if (isDialogueParagraph(node)) {
            decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: "mdi-dialogue" }));
          }
          // 段落内のインラインまで降りる必要はない
          return false;
        });

        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}
