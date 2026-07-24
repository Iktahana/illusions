import type { MdiHtmlRenderOptions } from "@illusions-lab/mdi";

export type HtmlWritingMode = "horizontal" | "vertical";

/**
 * HTML options are owned by @illusions-lab/mdi.
 *
 * `writingMode` is an Illusions-side source override. The MDI renderer owns
 * document semantics, so the main process applies it to the MDI front matter
 * before handing the source to the renderer.
 */
export type HtmlExportOptions = MdiHtmlRenderOptions & {
  writingMode?: HtmlWritingMode;
};
