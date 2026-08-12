/**
 * Application-owned editor behavior for Japanese prose.
 *
 * Document syntax belongs to the selected DocumentFormat adapter and layout
 * belongs to @illusions-lab/milkdown-plugin-vertical-writing. This module only
 * installs format-neutral editing helpers.
 */

import type { MilkdownPlugin } from "@milkdown/ctx";
import { $prose, $remark } from "@milkdown/utils";
import { headingAnchorSchema } from "./nodes/heading-anchor";
import { remarkFullWidthMarkdownPlugin, remarkHeadingAnchorPlugin } from "./syntax";
import { createHeadingIdFixerPlugin } from "./plugins/heading-id-fixer";
import { createHardbreakIndentPlugin } from "./plugins/hardbreak-indent";
import { createDialogueIndentPlugin } from "./plugins/dialogue-indent";
import { Plugin, PluginKey } from "@milkdown/prose/state";

interface NovelEditorFeatureOptions {
  readonly plainText?: boolean;
}

export function novelEditorFeatures(options: NovelEditorFeatureOptions = {}): MilkdownPlugin[] {
  const remarkHeadingAnchor = $remark("novelEditorHeadingAnchor", () => remarkHeadingAnchorPlugin);
  const remarkFullWidthMarkdown = $remark(
    "novelEditorFullWidthMarkdown",
    () => remarkFullWidthMarkdownPlugin as (o?: { enable?: boolean }) => (tree: unknown) => void,
    { enable: !options.plainText },
  );

  return [
    remarkFullWidthMarkdown,
    remarkHeadingAnchor,
    headingAnchorSchema,
    $prose(() => createHeadingIdFixerPlugin()),
    $prose(() => createHardbreakIndentPlugin()),
    $prose(() => createDialogueIndentPlugin()),
    $prose(
      () =>
        new Plugin({
          key: new PluginKey("novelEditorPresentation"),
          view: (view) => {
            view.dom.classList.add("novel-editor-content");
            return { destroy: () => view.dom.classList.remove("novel-editor-content") };
          },
        }),
    ),
  ].flat();
}
