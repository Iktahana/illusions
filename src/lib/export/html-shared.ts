import type { MdiHtmlRenderOptions } from "@illusions-lab/mdi";

/**
 * HTML options are owned by @illusions-lab/mdi.
 *
 * Keep this alias at the renderer/main-process boundary so Illusions does not
 * invent a second HTML configuration schema.
 */
export type HtmlExportOptions = MdiHtmlRenderOptions;
