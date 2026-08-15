import { AllSelection, NodeSelection, TextSelection } from "@milkdown/prose/state";
import { Decoration, type EditorView } from "@milkdown/prose/view";
import { redo, undo } from "@milkdown/prose/history";
import { setBlockType, wrapIn } from "@milkdown/prose/commands";
import { wrapInList } from "@milkdown/prose/schema-list";
import {
  mapMdiSourceSpansToEditorRanges,
  type MdiEditorMappingSnapshot,
} from "@illusions-lab/milkdown-plugin-mdi";
import {
  formatMdiTextPosition,
  getMdiTextBlocks,
  sourceSpansForTextRange,
} from "@illusions-lab/mdi";
import type { DocumentAdapter, DocumentFormat } from "@/lib/document-format";
import { normalizeRubyReading } from "@/lib/editor-page/ruby-dialog-contract";
import type { PosDecorationSpec } from "@/lib/editor-interaction/pos-decorations";
import {
  collectParagraphs,
  findScrollContainer,
  getAtomOffset,
  getVisibleParagraphs,
} from "@/lib/editor-page/paragraph-helpers";
import { codeUnitOffsetToGraphemeIndex } from "@/lib/editor-page/pos-highlight-utils";
import {
  canApplyMdiEdit,
  inspectMdiSelection,
  mdiEditCommand,
  type MdiEditOperation,
} from "./mdi-editing";
import { centerEditorPosition } from "@/lib/editor-page/center-editor-position";
import { createReplacementSteps, findSearchMatches } from "@/lib/editor-page/find-search-matches";
import { commandById, commandRegistry } from "./registry";
import type {
  EditorCommand,
  EditorCommandId,
  EditorCommandResult,
  EditorInteractionHandle,
  EditorPosHighlightMatch,
  EditorPosHighlightPresentation,
  EditorPosHighlightRequest,
  EditorPosHighlightSegment,
  EditorSearchPresentation,
  EditorSearchQuery,
  EditorSearchQueryResult,
  EditorSearchReplaceCommand,
  EditorSearchToken,
  EditorInteractionSnapshot,
  EditorSelectionSnapshot,
  SelectionToken,
} from "./types";

const EMPTY_RECT = null;

function buildRubyAvailabilityOperation(view: EditorView): MdiEditOperation {
  const selectionState = inspectMdiSelection(view.state);
  return selectionState.ruby ? { type: "removeRuby" } : { type: "setRuby", reading: "ふりがな" };
}

function buildTcyOperation(view: EditorView): MdiEditOperation {
  const selectionState = inspectMdiSelection(view.state);
  return selectionState.marks.tcy
    ? { type: "removeInlineMark", mark: "tcy" as const }
    : { type: "setInlineMark", mark: "tcy" as const };
}

export class EditorInteractionStore implements EditorInteractionHandle {
  private listeners = new Set<() => void>();
  private view: EditorView | null = null;
  private revision = 0;
  private generation = 0;
  private contentRevision = 0;
  private active = true;
  private composing = false;
  private lastNavigationNonce = -1;
  private snapshot: EditorInteractionSnapshot;
  private mdiMappingGetter: (() => MdiEditorMappingSnapshot | null) | null = null;
  private posHighlightDispatcher: ((decorations: readonly PosDecorationSpec[]) => void) | null =
    null;

  constructor(
    private readonly editorId: string,
    private format: DocumentFormat,
    private adapter: DocumentAdapter,
  ) {
    this.snapshot = this.buildSnapshot();
  }

  getSnapshot = (): EditorInteractionSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private emit(): void {
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((listener) => listener());
  }

  setMdiMappingGetter(getter: (() => MdiEditorMappingSnapshot | null) | null): void {
    this.mdiMappingGetter = getter;
  }

  setPosHighlightDispatcher(
    dispatcher: ((decorations: readonly PosDecorationSpec[]) => void) | null,
  ): void {
    this.posHighlightDispatcher = dispatcher;
  }

  attach(
    view: EditorView,
    generation: number,
    format: DocumentFormat,
    adapter: DocumentAdapter,
  ): void {
    this.view = view;
    this.generation = generation;
    this.format = format;
    this.adapter = adapter;
    this.revision++;
    this.contentRevision++;
    this.emit();
  }
  update({ docChanged = false }: { docChanged?: boolean } = {}): void {
    if (!this.view || this.composing) return;
    this.revision++;
    if (docChanged) this.contentRevision++;
    this.emit();
  }
  refreshGeometry(): void {
    if (!this.view || this.composing) return;
    this.emit();
  }
  setActive(active: boolean): void {
    if (this.active === active) return;
    if (!active) {
      this.clearSearchDecorations();
      this.clearPosHighlights();
    }
    this.active = active;
    this.revision++;
    this.emit();
  }
  setComposing(composing: boolean): void {
    this.composing = composing;
    if (!composing) this.revision++;
    this.emit();
  }
  detach(): void {
    this.clearSearchDecorations();
    this.clearPosHighlights();
    this.view = null;
    this.generation++;
    this.revision++;
    this.contentRevision++;
    this.emit();
  }

  createPosHighlightRequest(): EditorPosHighlightRequest | null {
    if (!this.view || this.composing) return null;

    if (this.format === "mdi") {
      const snapshot = this.mdiMappingGetter?.();
      if (!snapshot) return null;

      const blocks = getMdiTextBlocks(snapshot.source).blocks.filter((block) => block.span);
      const mappedSegments = blocks.map((block) => {
        const [resolution] = mapMdiSourceSpansToEditorRanges(snapshot, [block.span!], {
          source: snapshot.source,
          doc: this.view!.state.doc,
        });

        return {
          segment: {
            segmentType: "mdi-block",
            index: block.index,
            blockIndex: block.index,
            kind: block.kind,
            text: block.text,
            range: block.range,
            span: block.span,
            sourceMap: block.sourceMap,
            annotations: block.annotations,
            node: block.node,
          } satisfies EditorPosHighlightSegment,
          visible: resolution.matches.some((match) => this.rangeIsVisible(match.from, match.to)),
        };
      });

      const visibleSegments = mappedSegments.filter(({ visible }) => visible);
      const fallbackSegments =
        visibleSegments.length > 0
          ? visibleSegments
          : mappedSegments.slice(0, Math.min(5, mappedSegments.length));

      return {
        token: this.posHighlightToken(),
        documentFormat: this.format,
        source: snapshot.source,
        segments: fallbackSegments.map(({ segment }) => segment),
      };
    }

    const visibleParagraphs = getVisibleParagraphs(
      this.view,
      collectParagraphs(this.view.state.doc),
    );
    return {
      token: this.posHighlightToken(),
      documentFormat: this.format,
      segments: visibleParagraphs.map((paragraph) => ({
        segmentType: "paragraph",
        index: paragraph.index,
        pos: paragraph.pos,
        text: paragraph.text,
        atomAdjustments: paragraph.atomAdjustments,
      })),
    };
  }

  syncPosHighlightPresentation(presentation: EditorPosHighlightPresentation): void {
    const view = this.view;
    if (!view || !this.active) {
      this.clearPosHighlights();
      return;
    }

    if (
      !presentation.visible ||
      !presentation.token ||
      !presentation.request ||
      !this.isCurrentPosHighlightToken(presentation.token)
    ) {
      this.clearPosHighlights();
      return;
    }

    const decorations: PosDecorationSpec[] = [];
    for (const match of presentation.matches) {
      const segment = presentation.request.segments[match.segmentIndex];
      if (!segment) continue;
      if (presentation.disabledTypes.includes(match.category)) continue;
      const color = presentation.colors[match.category];
      if (!color) continue;

      if (segment.segmentType === "paragraph") {
        const range = this.plainSegmentRange(segment, match);
        if (!range) continue;
        decorations.push({ ...range, category: match.category, color });
        continue;
      }

      const snapshot = this.mdiMappingGetter?.();
      if (!snapshot) continue;
      const spans = sourceSpansForTextRange(segment, {
        start: formatMdiTextPosition({
          block: segment.blockIndex,
          character: codeUnitOffsetToGraphemeIndex(segment.text, match.start) + 1,
        }),
        end: formatMdiTextPosition({
          block: segment.blockIndex,
          character: codeUnitOffsetToGraphemeIndex(segment.text, match.end) + 1,
        }),
      });
      if (spans.length === 0) continue;

      const resolutions = mapMdiSourceSpansToEditorRanges(snapshot, spans, {
        source: snapshot.source,
        doc: view.state.doc,
      });

      for (const resolution of resolutions) {
        for (const candidate of resolution.matches) {
          if (candidate.channel !== "blockText") continue;
          decorations.push({
            from: candidate.from,
            to: candidate.to,
            category: match.category,
            color,
          });
        }
      }
    }

    try {
      this.posHighlightDispatcher?.(decorations);
    } catch {
      /* detached or stale editor */
    }
  }

  prepareSearchSelection(): string | undefined {
    const view = this.view;
    if (!view) return undefined;

    const { selection } = view.state;
    if (selection.empty) return undefined;

    const text = view.state.doc.textBetween(selection.from, selection.to, "\n") || undefined;
    if (text && selection instanceof TextSelection) {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selection.to)));
      this.update();
    }

    return text;
  }

  querySearch(query: EditorSearchQuery): EditorSearchQueryResult {
    return {
      token: this.searchToken(),
      matches: this.buildSearchMatches(query),
    };
  }

  syncSearchPresentation(presentation: EditorSearchPresentation): void {
    const view = this.view;
    if (!view || !this.active) return;

    if (!this.isCurrentSearchToken(presentation.token)) {
      this.clearSearchDecorations();
      return;
    }

    if (!presentation.visible || !presentation.searchTerm || presentation.matches.length === 0) {
      this.clearSearchDecorations();
      return;
    }

    const decorations = presentation.matches.map((match, index) =>
      Decoration.inline(match.from, match.to, {
        class: index === presentation.currentMatchIndex ? "search-result-current" : "search-result",
      }),
    );

    try {
      view.dispatch(view.state.tr.setMeta("searchDecorations", decorations));

      if (presentation.navigationNonce === this.lastNavigationNonce) return;
      this.lastNavigationNonce = presentation.navigationNonce;

      const current = presentation.matches[presentation.currentMatchIndex];
      if (!current) return;

      view.dispatch(
        view.state.tr.setSelection(
          TextSelection.create(view.state.doc, current.from, current.from),
        ),
      );
      centerEditorPosition(view, current.from);
    } catch {
      /* destroyed or detached view */
    }
  }

  replaceSearch(command: EditorSearchReplaceCommand): EditorCommandResult {
    const view = this.view;
    if (!view || !this.active) return { status: "unavailable" };
    if (!this.isCurrentSearchToken(command.token)) return { status: "stale" };

    const steps = createReplacementSteps(command.matches, command.replacement, command.options);
    if (steps.length === 0) return { status: "unavailable" };

    try {
      let tr = view.state.tr;
      for (const step of steps) {
        tr = step.text
          ? tr.replaceWith(step.from, step.to, view.state.schema.text(step.text))
          : tr.delete(step.from, step.to);
      }
      view.dispatch(tr.scrollIntoView());
      view.focus();
      this.update({ docChanged: true });
      return { status: "executed" };
    } catch (error) {
      return { status: "failed", error };
    }
  }

  private selection(): EditorSelectionSnapshot {
    const token = {
      editorId: this.editorId,
      generation: this.generation,
      selectionRevision: this.revision,
    };
    const view = this.view;
    if (!view || !view.state?.selection)
      return {
        kind: "none",
        from: 0,
        to: 0,
        text: "",
        anchor: null,
        head: null,
        rect: EMPTY_RECT,
        revision: this.revision,
        token,
        ruby: null,
      };
    const { selection } = view.state;
    const inspection = inspectMdiSelection(view.state);
    let anchor = null;
    let head = null;
    let rect: EditorSelectionSnapshot["rect"] = EMPTY_RECT;
    try {
      const a = view.coordsAtPos(selection.anchor);
      const h = view.coordsAtPos(selection.head);
      anchor = { x: a.left, y: a.top };
      head = { x: h.right, y: h.bottom };
      const domSelection = view.dom?.ownerDocument?.getSelection?.();
      const domRange =
        domSelection?.rangeCount &&
        view.dom?.contains(domSelection.anchorNode) &&
        view.dom.contains(domSelection.focusNode)
          ? domSelection.getRangeAt(0).getBoundingClientRect()
          : null;
      const left = domRange?.left ?? Math.min(a.left, h.left);
      const top = domRange?.top ?? Math.min(a.top, h.top);
      const right = domRange?.right ?? Math.max(a.right, h.right);
      const bottom = domRange?.bottom ?? Math.max(a.bottom, h.bottom);
      rect = { left, top, right, bottom, width: right - left, height: bottom - top };
    } catch {
      /* detached or temporarily unmeasurable view */
    }
    const kind = selection.empty
      ? "caret"
      : selection instanceof AllSelection
        ? "all"
        : selection instanceof NodeSelection
          ? "node"
          : "text";
    return {
      kind,
      from: selection.from,
      to: selection.to,
      text: view.state.doc.textBetween(selection.from, selection.to, "\n"),
      anchor,
      head,
      rect,
      revision: this.revision,
      token,
      ruby: inspection.ruby,
    };
  }

  private buildSnapshot(): EditorInteractionSnapshot {
    const selection = this.selection();
    const capabilities = this.adapter.capabilities ?? {
      markdown: this.format !== "plain-text",
      gfm: this.format !== "plain-text",
      mdi: this.format === "mdi",
      ruby: false,
      tcy: false,
    };
    const formatting = capabilities.markdown;
    const availability = Object.fromEntries(
      commandRegistry.map((entry) => [
        entry.id,
        Boolean(
          this.view &&
          this.active &&
          (!entry.requiresSelection || (selection.kind !== "caret" && selection.kind !== "none")) &&
          (!entry.requiresFormatting || formatting) &&
          (!entry.requiresCapability || capabilities[entry.requiresCapability]) &&
          (entry.id !== "format.ruby" ||
            (this.view &&
              canApplyMdiEdit(this.view.state, buildRubyAvailabilityOperation(this.view)))) &&
          (entry.id !== "format.tcy" ||
            (this.view && canApplyMdiEdit(this.view.state, buildTcyOperation(this.view)))),
        ),
      ]),
    ) as Record<EditorCommandId, boolean>;
    return {
      editorId: this.editorId,
      generation: this.generation,
      ready: Boolean(this.view),
      active: this.active,
      focused: Boolean(
        this.view && typeof this.view.hasFocus === "function" && this.view.hasFocus(),
      ),
      composing: this.composing,
      documentFormat: this.format,
      capabilities,
      selection,
      availability,
    };
  }

  execute(command: EditorCommand, token?: SelectionToken): EditorCommandResult {
    const view = this.view;
    const definition = commandById.get(command.id);
    if (!view || !definition || !this.snapshot.availability[command.id])
      return { status: "unavailable" };
    if (
      definition.requiresSelection &&
      (!token ||
        token.editorId !== this.editorId ||
        token.generation !== this.generation ||
        token.selectionRevision !== this.revision)
    )
      return { status: "stale" };
    try {
      if (command.id === "edit.undo" || command.id === "edit.redo") {
        const ran = (command.id === "edit.undo" ? undo : redo)(view.state, view.dispatch, view);
        return { status: ran ? "executed" : "unavailable" };
      }
      if (command.id === "edit.selectAll") {
        view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
        return { status: "executed" };
      }
      if (command.id === "format.ruby") {
        if (command.mode === "remove") {
          const ran = mdiEditCommand({ type: "removeRuby" })(view.state, view.dispatch, view);
          return { status: ran ? "executed" : "unavailable" };
        }
        const selectionState = inspectMdiSelection(view.state);
        if (selectionState.ruby) {
          if (command.segments.length !== 1) return { status: "unavailable" };
          const [segment] = command.segments;
          if (!segment?.ruby) return { status: "unavailable" };
          const ran = mdiEditCommand({
            type: "setRuby",
            reading: normalizeRubyReading(segment.ruby),
          })(view.state, view.dispatch, view);
          return { status: ran ? "executed" : "unavailable" };
        }
        const { from, to } = view.state.selection;
        const selectedText = view.state.doc.textBetween(from, to, "", "");
        const combinedBase = command.segments.map((segment) => segment.base).join("");
        if (!selectedText || combinedBase !== selectedText) return { status: "unavailable" };
        let end = to;
        for (const segment of [...command.segments].reverse()) {
          const start = end - segment.base.length;
          if (segment.ruby) {
            view.dispatch(
              view.state.tr.setSelection(TextSelection.create(view.state.doc, start, end)),
            );
            const ran = mdiEditCommand({
              type: "setRuby",
              reading: normalizeRubyReading(segment.ruby),
            })(view.state, view.dispatch, view);
            if (!ran) return { status: "unavailable" };
          }
          end = start;
        }
        view.focus();
        return { status: "executed" };
      }
      if (command.id === "format.tcy") {
        const ran = mdiEditCommand(buildTcyOperation(view))(view.state, view.dispatch, view);
        return { status: ran ? "executed" : "unavailable" };
      }
      if (definition.nativeRole) return { status: "unavailable" };
      const { from, to } = view.state.selection;
      let tr = view.state.tr;
      const markName: Record<string, string> = {
        "format.strong": "strong",
        "format.emphasis": "emphasis",
        "format.strikethrough": "strike_through",
        "format.inlineCode": "inlineCode",
      };
      if (command.id in markName) {
        const mark = view.state.schema.marks[markName[command.id]];
        if (!mark) return { status: "unavailable" };
        const active = view.state.doc.rangeHasMark(from, to, mark);
        tr = active ? tr.removeMark(from, to, mark) : tr.addMark(from, to, mark.create());
      } else if (command.id === "format.clear") {
        tr = tr.removeMark(from, to);
        const paragraph = view.state.schema.nodes.paragraph;
        if (paragraph) {
          view.dispatch(tr);
          setBlockType(paragraph)(view.state, view.dispatch, view);
          view.focus();
          return { status: "executed" };
        }
      } else if (command.id === "format.heading") {
        const type = view.state.schema.nodes.heading;
        if (!type) return { status: "unavailable" };
        tr.doc.nodesBetween(from, to, (node, pos) => {
          if (node.isTextblock) tr = tr.setNodeMarkup(pos, type, { level: command.level ?? 1 });
        });
      } else if (command.id === "format.blockquote") {
        const type = view.state.schema.nodes.blockquote;
        if (!type || !wrapIn(type)(view.state, view.dispatch, view))
          return { status: "unavailable" };
        view.focus();
        return { status: "executed" };
      } else if (command.id === "format.bulletList" || command.id === "format.orderedList") {
        const type =
          view.state.schema.nodes[
            command.id === "format.bulletList" ? "bullet_list" : "ordered_list"
          ];
        if (!type || !wrapInList(type)(view.state, view.dispatch, view))
          return { status: "unavailable" };
        view.focus();
        return { status: "executed" };
      } else return { status: "unavailable" };
      view.dispatch(tr.scrollIntoView());
      view.focus();
      return { status: "executed" };
    } catch (error) {
      return { status: "failed", error };
    }
  }

  private searchToken(): EditorSearchToken {
    return {
      editorId: this.editorId,
      generation: this.generation,
      contentRevision: this.contentRevision,
    };
  }

  private posHighlightToken() {
    return {
      editorId: this.editorId,
      generation: this.generation,
      contentRevision: this.contentRevision,
      viewportRevision: this.revision,
    };
  }

  private isCurrentSearchToken(token: EditorSearchToken | null): boolean {
    return Boolean(
      token &&
      token.editorId === this.editorId &&
      token.generation === this.generation &&
      token.contentRevision === this.contentRevision,
    );
  }

  private isCurrentPosHighlightToken(token: EditorPosHighlightRequest["token"] | null): boolean {
    return Boolean(
      token &&
      token.editorId === this.editorId &&
      token.generation === this.generation &&
      token.contentRevision === this.contentRevision &&
      token.viewportRevision === this.revision,
    );
  }

  private buildSearchMatches(query: EditorSearchQuery) {
    const view = this.view;
    if (!view || !this.active || !query.term) return [];

    const matches = findSearchMatches(view.state.doc, query.term, query.options);
    return matches.map((match) => {
      const contextLength = 30;
      const beforeStart = Math.max(0, match.from - contextLength);
      const afterEnd = Math.min(view.state.doc.content.size, match.to + contextLength);
      const beforeText = view.state.doc.textBetween(beforeStart, match.from);
      const afterText = view.state.doc.textBetween(match.to, afterEnd);

      return {
        ...match,
        contextBefore:
          beforeText.length > contextLength ? `...${beforeText.slice(-contextLength)}` : beforeText,
        contextAfter:
          afterText.length > contextLength ? `${afterText.slice(0, contextLength)}...` : afterText,
      };
    });
  }

  private rangeIsVisible(from: number, to: number): boolean {
    const view = this.view;
    if (!view) return false;

    try {
      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to);
      const containerRect = findScrollContainer(view.dom).getBoundingClientRect();
      const top = Math.min(start.top, end.top);
      const bottom = Math.max(start.bottom, end.bottom);
      return bottom >= containerRect.top && top <= containerRect.bottom;
    } catch {
      return false;
    }
  }

  private plainSegmentRange(
    segment: Extract<EditorPosHighlightSegment, { segmentType: "paragraph" }>,
    match: EditorPosHighlightMatch,
  ): { from: number; to: number } | null {
    if (match.end <= match.start) return null;
    const from =
      segment.pos + 1 + match.start + getAtomOffset(segment.atomAdjustments, match.start);
    const to =
      segment.pos + 1 + match.end + getAtomOffset(segment.atomAdjustments, match.end, true);
    return to > from ? { from, to } : null;
  }

  private clearSearchDecorations(): void {
    if (!this.view) return;
    try {
      this.view.dispatch(this.view.state.tr.setMeta("searchDecorations", []));
    } catch {
      /* destroyed or detached view */
    }
  }

  private clearPosHighlights(): void {
    try {
      this.posHighlightDispatcher?.([]);
    } catch {
      /* destroyed or detached view */
    }
  }
}
