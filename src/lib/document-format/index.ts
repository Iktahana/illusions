import { defaultValueCtx, serializerCtx, type Editor } from "@milkdown/core";
import type { Ctx } from "@milkdown/ctx";
import { gfm } from "@milkdown/preset-gfm";
import type { Node as ProseNode } from "@milkdown/prose/model";
import { $remark } from "@milkdown/utils";
import { getMdi, initializeMdi, mdi } from "@illusions-lab/milkdown-plugin-mdi";
import { getMdiTextBlocks, parse, type MdiDiagnostic } from "@illusions-lab/mdi";
import { remarkPlainTextPlugin } from "@/packages/milkdown-plugin-japanese-novel/syntax/remark-plain-text";
import type { SupportedFileExtension } from "@/lib/project/project-types";

export type DocumentFormat = "mdi" | "markdown" | "plain-text";

export interface DocumentCapabilities {
  readonly markdown: boolean;
  readonly gfm: boolean;
  readonly mdi: boolean;
  readonly ruby: boolean;
  readonly tcy: boolean;
}

export interface TextProjection {
  readonly text: string;
  readonly diagnostics: readonly MdiDiagnostic[];
}

export type DocumentDiagnostic = MdiDiagnostic;

export interface DocumentAdapter {
  readonly format: DocumentFormat;
  readonly capabilities: DocumentCapabilities;
  initialize(): Promise<void>;
  configureEditor(editor: Editor): Editor;
  encodeEditor(ctx: Ctx, document: ProseNode): string;
  projectText(source: string): TextProjection;
  diagnostics(source: string): readonly MdiDiagnostic[];
}

const noDiagnostics = (): readonly MdiDiagnostic[] => [];
const ready = async (): Promise<void> => undefined;

export const encodePlainTextDocument = (document: ProseNode, originalSource = ""): string => {
  const lines: string[] = [];
  document.forEach((node) => lines.push(node.textContent));
  const lineEnding = originalSource.includes("\r\n") ? "\r\n" : "\n";
  return lines.join(lineEnding);
};

let mdiInitialization: Promise<void> | undefined;
const initializeMdiOnce = (): Promise<void> => {
  mdiInitialization ??= initializeMdi();
  return mdiInitialization;
};

const mdiAdapter: DocumentAdapter = {
  format: "mdi",
  capabilities: { markdown: true, gfm: true, mdi: true, ruby: true, tcy: true },
  initialize: initializeMdiOnce,
  configureEditor: (editor) => editor.use(gfm).use(mdi()),
  encodeEditor: (ctx) => getMdi()(ctx),
  projectText: (source) => {
    const result = getMdiTextBlocks(source);
    return {
      text: result.blocks.map((block) => block.text).join("\n\n"),
      diagnostics: result.diagnostics,
    };
  },
  diagnostics: (source) => parse(source).diagnostics,
};

const markdownAdapter: DocumentAdapter = {
  format: "markdown",
  capabilities: { markdown: true, gfm: true, mdi: false, ruby: false, tcy: false },
  initialize: ready,
  configureEditor: (editor) => editor.use(gfm),
  encodeEditor: (ctx, document) => ctx.get(serializerCtx)(document),
  // Markdown analysis remains Markdown-owned. No MDI parser is imported or
  // called on this path; consumers that need a rendered projection may layer a
  // Markdown renderer above this literal source boundary.
  projectText: (source) => ({ text: source, diagnostics: [] }),
  diagnostics: noDiagnostics,
};

const plainTextAdapter: DocumentAdapter = {
  format: "plain-text",
  capabilities: { markdown: false, gfm: false, mdi: false, ruby: false, tcy: false },
  initialize: ready,
  configureEditor: (editor) =>
    editor.use($remark("plainTextDocument", () => remarkPlainTextPlugin)),
  encodeEditor: (ctx, document) => {
    const initialValue = ctx.get(defaultValueCtx);
    return encodePlainTextDocument(document, typeof initialValue === "string" ? initialValue : "");
  },
  projectText: (source) => ({ text: source, diagnostics: [] }),
  diagnostics: noDiagnostics,
};

const adapters: Readonly<Record<DocumentFormat, DocumentAdapter>> = {
  mdi: mdiAdapter,
  markdown: markdownAdapter,
  "plain-text": plainTextAdapter,
};

export const documentFormatForExtension = (extension: SupportedFileExtension): DocumentFormat => {
  if (extension === ".mdi") return "mdi";
  if (extension === ".md") return "markdown";
  return "plain-text";
};

export const getDocumentAdapter = (format: DocumentFormat): DocumentAdapter => adapters[format];
