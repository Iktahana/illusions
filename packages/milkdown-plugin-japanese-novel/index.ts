/**
 * milkdown-plugin-japanese-novel
 * 日本語小説向けの application-owned editor behavior and styles.
 * MDI syntax is owned by @illusions-lab/milkdown-plugin-mdi.
 */

import type { MilkdownPlugin } from "@milkdown/ctx";
import { $prose, $remark } from "@milkdown/utils";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { headingAnchorSchema } from "./nodes/heading-anchor";
import { remarkFullWidthMarkdownPlugin, remarkHeadingAnchorPlugin } from "./syntax";
import { createHeadingIdFixerPlugin } from "./plugins/heading-id-fixer";
import { createHardbreakIndentPlugin } from "./plugins/hardbreak-indent";
import { createDialogueIndentPlugin } from "./plugins/dialogue-indent";
import { defaultJapaneseNovelOptions, type JapaneseNovelOptions } from "./config";

export type { JapaneseNovelOptions } from "./config";
export { calculateManuscriptPages, countCharacters } from "./utils";

/**
 * 日本語小説向けプラグイン。`.use(japaneseNovel({ isVertical, ... }))` で利用する。
 */
export function japaneseNovel(options: JapaneseNovelOptions = {}): MilkdownPlugin[] {
  const opts = { ...defaultJapaneseNovelOptions, ...options };
  const { isVertical, showManuscriptLine, plainText } = opts;

  const classes: string[] = ["milkdown-japanese-base"];
  if (isVertical) {
    classes.push("milkdown-japanese-vertical");
  } else {
    classes.push("milkdown-japanese-horizontal");
  }
  if (showManuscriptLine) classes.push("manuscript-style");

  const remarkHeadingAnchor = $remark(
    "japaneseNovelHeadingAnchor",
    () => remarkHeadingAnchorPlugin,
  );
  const remarkFullWidthMarkdown = $remark(
    "japaneseNovelFullWidthMarkdown",
    () => remarkFullWidthMarkdownPlugin as (o?: { enable?: boolean }) => (tree: unknown) => void,
    { enable: !plainText },
  );

  const stylePlugin = $prose(() => {
    const classList = [...classes];
    return new Plugin({
      key: new PluginKey("japaneseNovelStyle"),
      view: (editorView) => {
        const el = editorView.dom;
        classList.forEach((c) => el.classList.add(c));
        return {
          destroy: () => {
            classList.forEach((c) => el.classList.remove(c));
          },
        };
      },
    });
  });

  const headingIdFixerPlugin = $prose(() => {
    return createHeadingIdFixerPlugin();
  });

  const hardbreakIndentPlugin = $prose(() => {
    return createHardbreakIndentPlugin();
  });

  const dialogueIndentPlugin = $prose(() => {
    return createDialogueIndentPlugin();
  });

  const plugins: MilkdownPlugin[] = [
    remarkFullWidthMarkdown,
    remarkHeadingAnchor,
    headingAnchorSchema,
    headingIdFixerPlugin,
    hardbreakIndentPlugin,
    dialogueIndentPlugin,
    stylePlugin,
  ].flat();

  return plugins;
}
