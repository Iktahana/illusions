import { Schema } from "@milkdown/prose/model";
import { AllSelection, EditorState, NodeSelection, TextSelection } from "@milkdown/prose/state";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDocumentAdapter, type DocumentFormat } from "@/lib/document-format";

const mdiEditing = vi.hoisted(() => ({
  tcyActive: false,
  rubySelection: null as null | { base: string; reading: string | readonly string[] },
  canApply: true,
  appliedOperations: [] as Array<Record<string, unknown>>,
}));

vi.mock("../mdi-editing", () => ({
  inspectMdiSelection: () => ({
    marks: { tcy: mdiEditing.tcyActive },
    ruby: mdiEditing.rubySelection,
  }),
  canApplyMdiEdit: () => mdiEditing.canApply,
  mdiEditCommand: (operation: Record<string, unknown>) => () => {
    mdiEditing.appliedOperations.push(operation);
    mdiEditing.tcyActive = operation.type === "setInlineMark";
    if (operation.type === "removeRuby") mdiEditing.rubySelection = null;
    if (operation.type === "setRuby")
      mdiEditing.rubySelection = {
        base: mdiEditing.rubySelection?.base ?? "",
        reading: operation.reading as string | readonly string[],
      };
    return mdiEditing.canApply;
  },
}));

import { EditorInteractionStore } from "../store";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "text*", group: "block" },
    heading: { content: "text*", group: "block", attrs: { level: { default: 1 } } },
    text: { group: "inline" },
  },
  marks: { strong: {}, emphasis: {}, strike_through: {}, inlineCode: {} },
});

function makeState(text = "選択範囲", from = 1, to = 3) {
  let state = EditorState.create({
    schema,
    doc: schema.node("doc", null, [schema.node("paragraph", null, schema.text(text))]),
  });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
  return state;
}

function makeViewFromState(state: EditorState) {
  const dom = document.createElement("div");
  dom.getBoundingClientRect = () =>
    ({
      top: 0,
      bottom: 200,
      left: 0,
      right: 200,
      width: 200,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.appendChild(dom);
  const view = {
    state,
    dispatch: vi.fn((transaction) => {
      view.state = view.state.apply(transaction);
    }),
    coordsAtPos: vi.fn((position: number) => ({
      left: position * 10,
      right: position * 10 + 2,
      top: 20,
      bottom: 36,
    })),
    hasFocus: vi.fn(() => true),
    focus: vi.fn(),
    dom,
  };
  return view;
}

function makeView(text = "選択範囲", from = 1, to = 3) {
  return makeViewFromState(makeState(text, from, to));
}

function store(format: DocumentFormat = "markdown") {
  return new EditorInteractionStore("editor-a", format, getDocumentAdapter(format));
}

describe("EditorInteractionStore", () => {
  beforeEach(() => {
    mdiEditing.tcyActive = false;
    mdiEditing.rubySelection = null;
    mdiEditing.canApply = true;
    mdiEditing.appliedOperations.length = 0;
  });

  it("publishes text, coordinates and a generation-bound token", () => {
    const interaction = store();
    interaction.attach(makeView() as never, 4, "markdown", getDocumentAdapter("markdown"));
    const snapshot = interaction.getSnapshot();
    expect(snapshot.selection).toMatchObject({ kind: "text", from: 1, to: 3, text: "選択" });
    expect(snapshot.selection.rect).toMatchObject({ left: 10, right: 32, top: 20, bottom: 36 });
    expect(snapshot.selection.token).toEqual({
      editorId: "editor-a",
      generation: 4,
      selectionRevision: 1,
    });
  });

  it("rejects a stale token after selection, active-pane and destroy transitions", () => {
    const interaction = store();
    interaction.attach(makeView() as never, 1, "markdown", getDocumentAdapter("markdown"));
    const token = interaction.getSnapshot().selection.token;
    interaction.update();
    expect(interaction.execute({ id: "format.strong" }, token).status).toBe("stale");
    const current = interaction.getSnapshot().selection.token;
    interaction.setActive(false);
    interaction.setActive(true);
    expect(interaction.execute({ id: "format.strong" }, current).status).toBe("stale");
    interaction.detach();
    expect(interaction.getSnapshot()).toMatchObject({ ready: false, selection: { kind: "none" } });
  });

  it("makes formatting explicitly unavailable for plain text", () => {
    const interaction = store("plain-text");
    interaction.attach(makeView() as never, 0, "plain-text", getDocumentAdapter("plain-text"));
    expect(interaction.getSnapshot().availability["format.strong"]).toBe(false);
    expect(interaction.getSnapshot().availability["format.ruby"]).toBe(false);
    expect(interaction.getSnapshot().availability["format.tcy"]).toBe(false);
    expect(
      interaction.execute({ id: "format.strong" }, interaction.getSnapshot().selection.token),
    ).toEqual({ status: "unavailable" });
    expect(
      interaction.execute(
        { id: "format.ruby", mode: "remove" },
        interaction.getSnapshot().selection.token,
      ),
    ).toEqual({ status: "unavailable" });
    expect(
      interaction.execute({ id: "format.tcy" }, interaction.getSnapshot().selection.token),
    ).toEqual({ status: "unavailable" });
  });

  it("keeps Ruby/TCY unavailable for markdown and reflects MDI edit capability for mdi", () => {
    const markdown = store("markdown");
    markdown.attach(makeView() as never, 0, "markdown", getDocumentAdapter("markdown"));
    expect(markdown.getSnapshot().availability["format.ruby"]).toBe(false);
    expect(markdown.getSnapshot().availability["format.tcy"]).toBe(false);

    const mdi = store("mdi");
    mdi.attach(makeView() as never, 0, "mdi", getDocumentAdapter("mdi"));
    expect(mdi.getSnapshot().availability["format.ruby"]).toBe(true);
    expect(mdi.getSnapshot().availability["format.tcy"]).toBe(true);

    mdiEditing.canApply = false;
    mdi.update();
    expect(mdi.getSnapshot().availability["format.ruby"]).toBe(false);
    expect(mdi.getSnapshot().availability["format.tcy"]).toBe(false);
  });

  it("does not publish unstable selection revisions during composition", () => {
    const interaction = store();
    interaction.attach(makeView() as never, 0, "markdown", getDocumentAdapter("markdown"));
    interaction.setComposing(true);
    const revision = interaction.getSnapshot().selection.revision;
    interaction.update();
    expect(interaction.getSnapshot().selection.revision).toBe(revision);
    interaction.setComposing(false);
    expect(interaction.getSnapshot().selection.revision).toBeGreaterThan(revision);
  });

  it("survives coordinate lookup failure", () => {
    const interaction = store();
    const view = makeView();
    view.coordsAtPos.mockImplementation(() => {
      throw new Error("detached");
    });
    interaction.attach(view as never, 0, "markdown", getDocumentAdapter("markdown"));
    expect(interaction.getSnapshot().selection.rect).toBeNull();
  });

  it("prefers the DOM range bounding rect when the live selection is measurable", () => {
    const interaction = store();
    const view = makeView();
    const anchorNode = {};
    const focusNode = {};
    Object.assign(view, {
      dom: {
        ownerDocument: {
          getSelection: () => ({
            rangeCount: 1,
            anchorNode,
            focusNode,
            getRangeAt: () => ({
              getBoundingClientRect: () => ({
                left: 44,
                top: 18,
                right: 144,
                bottom: 66,
                width: 100,
                height: 48,
              }),
            }),
          }),
        },
        contains: (node: unknown) => node === anchorNode || node === focusNode,
      },
    });
    interaction.attach(view as never, 0, "markdown", getDocumentAdapter("markdown"));
    expect(interaction.getSnapshot().selection.rect).toMatchObject({
      left: 44,
      top: 18,
      right: 144,
      bottom: 66,
      width: 100,
      height: 48,
    });
  });

  it("notifies subscribers and refreshes geometry without invalidating the token", () => {
    const interaction = store();
    const listener = vi.fn();
    const unsubscribe = interaction.subscribe(listener);
    interaction.refreshGeometry();
    interaction.attach(makeView() as never, 0, "markdown", getDocumentAdapter("markdown"));
    const token = interaction.getSnapshot().selection.token;
    interaction.refreshGeometry();
    expect(interaction.getSnapshot().selection.token).toEqual(token);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    interaction.update();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("preserves backward multi-block selection text and anchor/head ordering", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, schema.text("前段")),
      schema.node("paragraph", null, schema.text("後段")),
    ]);
    let state = EditorState.create({ schema, doc });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 7, 2)));
    const view = makeViewFromState(state);
    const interaction = store();
    interaction.attach(view as never, 3, "markdown", getDocumentAdapter("markdown"));
    const snapshot = interaction.getSnapshot().selection;
    expect(snapshot.kind).toBe("text");
    expect(snapshot.text).toBe(state.doc.textBetween(snapshot.from, snapshot.to, "\n"));
    expect(snapshot.text).toContain("\n");
    expect(snapshot.anchor).toEqual({ x: 70, y: 20 });
    expect(snapshot.head).toEqual({ x: 22, y: 36 });
  });

  it("distinguishes node and all selections", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, schema.text("一段落")),
      schema.node("paragraph", null, schema.text("二段落")),
    ]);

    let nodeState = EditorState.create({ schema, doc });
    nodeState = nodeState.apply(nodeState.tr.setSelection(NodeSelection.create(nodeState.doc, 0)));
    const nodeInteraction = store();
    nodeInteraction.attach(
      makeViewFromState(nodeState) as never,
      1,
      "markdown",
      getDocumentAdapter("markdown"),
    );
    expect(nodeInteraction.getSnapshot().selection.kind).toBe("node");

    let allState = EditorState.create({ schema, doc });
    allState = allState.apply(allState.tr.setSelection(new AllSelection(allState.doc)));
    const allInteraction = store();
    allInteraction.attach(
      makeViewFromState(allState) as never,
      1,
      "markdown",
      getDocumentAdapter("markdown"),
    );
    expect(allInteraction.getSnapshot().selection.kind).toBe("all");
  });

  it("invalidates old tokens after generation replacement and disables inactive panes", () => {
    const interaction = store();
    interaction.attach(
      makeView("旧", 1, 2) as never,
      1,
      "markdown",
      getDocumentAdapter("markdown"),
    );
    const staleToken = interaction.getSnapshot().selection.token;

    interaction.attach(
      makeView("新", 1, 2) as never,
      2,
      "markdown",
      getDocumentAdapter("markdown"),
    );
    expect(interaction.getSnapshot()).toMatchObject({ generation: 2, selection: { text: "新" } });
    expect(interaction.execute({ id: "format.strong" }, staleToken)).toEqual({ status: "stale" });

    const currentToken = interaction.getSnapshot().selection.token;
    interaction.setActive(false);
    expect(interaction.getSnapshot().availability["format.strong"]).toBe(false);
    expect(interaction.execute({ id: "format.strong" }, currentToken)).toEqual({
      status: "unavailable",
    });
  });

  it("executes selection and mark commands through the current view", () => {
    const interaction = store();
    const view = makeView();
    interaction.attach(view as never, 0, "markdown", getDocumentAdapter("markdown"));
    expect(interaction.execute({ id: "edit.selectAll" })).toEqual({ status: "executed" });
    interaction.update();
    const allToken = interaction.getSnapshot().selection.token;
    expect(interaction.execute({ id: "format.strong" }, allToken)).toEqual({ status: "executed" });
    interaction.update();
    expect(
      interaction.execute({ id: "format.strong" }, interaction.getSnapshot().selection.token),
    ).toEqual({ status: "executed" });
    expect(view.focus).toHaveBeenCalled();
  });

  it("executes TCY with the current selection token and flips the inline mark operation", () => {
    const interaction = store("mdi");
    interaction.attach(makeView("12月", 1, 3) as never, 0, "mdi", getDocumentAdapter("mdi"));
    const token = interaction.getSnapshot().selection.token;
    expect(interaction.execute({ id: "format.tcy" }, token)).toEqual({ status: "executed" });
    expect(mdiEditing.appliedOperations).toEqual([{ type: "setInlineMark", mark: "tcy" }]);

    interaction.update();
    expect(
      interaction.execute({ id: "format.tcy" }, interaction.getSnapshot().selection.token),
    ).toEqual({
      status: "executed",
    });
    expect(mdiEditing.appliedOperations.at(-1)).toEqual({
      type: "removeInlineMark",
      mark: "tcy",
    });
  });

  it("executes Ruby over a plain-text MDI selection and preserves grouped readings", () => {
    const interaction = store("mdi");
    interaction.attach(makeView("東京駅", 1, 4) as never, 0, "mdi", getDocumentAdapter("mdi"));
    const token = interaction.getSnapshot().selection.token;

    expect(
      interaction.execute(
        {
          id: "format.ruby",
          mode: "apply",
          segments: [
            { base: "東京", ruby: ["とう", "きょう"] },
            { base: "駅", ruby: "えき" },
          ],
        },
        token,
      ),
    ).toEqual({ status: "executed" });

    expect(mdiEditing.appliedOperations).toEqual([
      { type: "setRuby", reading: "えき" },
      { type: "setRuby", reading: ["とう", "きょう"] },
    ]);
  });

  it("edits and removes an existing Ruby selection through the current token", () => {
    const interaction = store("mdi");
    interaction.attach(makeView("漢字", 1, 3) as never, 0, "mdi", getDocumentAdapter("mdi"));
    mdiEditing.rubySelection = { base: "漢字", reading: "かんじ" };
    interaction.update();
    const token = interaction.getSnapshot().selection.token;

    expect(interaction.getSnapshot().selection.ruby).toEqual({
      base: "漢字",
      reading: "かんじ",
    });
    expect(
      interaction.execute(
        {
          id: "format.ruby",
          mode: "apply",
          segments: [{ base: "漢字", ruby: ["かん", "じ"] }],
        },
        token,
      ),
    ).toEqual({ status: "executed" });
    expect(mdiEditing.appliedOperations.at(-1)).toEqual({
      type: "setRuby",
      reading: ["かん", "じ"],
    });

    interaction.update();
    const removeToken = interaction.getSnapshot().selection.token;
    expect(interaction.execute({ id: "format.ruby", mode: "remove" }, removeToken)).toEqual({
      status: "executed",
    });
    expect(mdiEditing.appliedOperations.at(-1)).toEqual({ type: "removeRuby" });
  });

  it("executes clear and heading and rejects unsupported renderer commands", () => {
    for (const command of [{ id: "format.clear" }, { id: "format.heading", level: 2 }] as const) {
      const interaction = store();
      const view = makeView();
      interaction.attach(view as never, 0, "markdown", getDocumentAdapter("markdown"));
      expect(interaction.execute(command, interaction.getSnapshot().selection.token).status).toBe(
        "executed",
      );
    }
    const interaction = store();
    interaction.attach(makeView() as never, 0, "markdown", getDocumentAdapter("markdown"));
    expect(
      interaction.execute({ id: "format.blockquote" }, interaction.getSnapshot().selection.token),
    ).toEqual({ status: "unavailable" });
    expect(
      interaction.execute({ id: "edit.copy" }, interaction.getSnapshot().selection.token),
    ).toEqual({ status: "unavailable" });
  });

  it("requires a token for selection commands", () => {
    const interaction = store();
    interaction.attach(makeView() as never, 0, "markdown", getDocumentAdapter("markdown"));
    expect(interaction.execute({ id: "format.strong" })).toEqual({ status: "stale" });
  });

  it("prepares the selected text for search without exposing EditorView to the caller", () => {
    const interaction = store();
    const view = makeView("検索対象", 1, 3);
    interaction.attach(view as never, 0, "markdown", getDocumentAdapter("markdown"));

    expect(interaction.prepareSearchSelection()).toBe("検索");
    expect(interaction.getSnapshot().selection).toMatchObject({
      kind: "caret",
      from: 3,
      to: 3,
      text: "",
    });
  });

  it("does not prepare search text without a live non-collapsed selection", () => {
    const interaction = store();
    expect(interaction.prepareSearchSelection()).toBeUndefined();

    interaction.attach(
      makeView("検索対象", 2, 2) as never,
      0,
      "markdown",
      getDocumentAdapter("markdown"),
    );
    expect(interaction.prepareSearchSelection()).toBeUndefined();
  });

  it("queries current-document search matches with a content-bound token", () => {
    const interaction = store();
    interaction.attach(
      makeView("前 target 後 target", 1, 1) as never,
      5,
      "markdown",
      getDocumentAdapter("markdown"),
    );

    const result = interaction.querySearch({
      term: "target",
      options: { caseSensitive: true },
    });

    expect(result.token).toEqual({
      editorId: "editor-a",
      generation: 5,
      contentRevision: 1,
    });
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0]).toMatchObject({
      text: "target",
      contextBefore: expect.stringContaining("前"),
      contextAfter: expect.stringContaining("後"),
    });

    interaction.update({ docChanged: true });
    expect(
      interaction.replaceSearch({
        replacement: "swap",
        matches: result.matches,
        token: result.token,
        options: { caseSensitive: true },
      }),
    ).toEqual({ status: "stale" });
  });

  it("replaces current search matches and guards stale generations", () => {
    const interaction = store();
    const view = makeView("target target", 1, 1);
    interaction.attach(view as never, 2, "markdown", getDocumentAdapter("markdown"));

    const result = interaction.querySearch({
      term: "target",
      options: { caseSensitive: true },
    });
    expect(
      interaction.replaceSearch({
        replacement: "swap",
        matches: result.matches,
        token: result.token,
        options: { caseSensitive: true },
      }),
    ).toEqual({ status: "executed" });
    expect(view.state.doc.textContent).toBe("swap swap");

    const stale = result.token;
    interaction.attach(
      makeView("fresh", 1, 1) as never,
      3,
      "markdown",
      getDocumentAdapter("markdown"),
    );
    expect(
      interaction.replaceSearch({
        replacement: "older",
        matches: result.matches,
        token: stale,
        options: { caseSensitive: true },
      }),
    ).toEqual({ status: "stale" });
  });

  it("publishes search decorations, navigates once per nonce, and clears stale presentation", () => {
    const interaction = store();
    const view = makeView("target and target", 1, 1);
    interaction.attach(view as never, 7, "markdown", getDocumentAdapter("markdown"));
    const result = interaction.querySearch({
      term: "target",
      options: { caseSensitive: true },
    });
    const presentation = {
      token: result.token,
      visible: true,
      searchTerm: "target",
      matches: result.matches,
      currentMatchIndex: 0,
      navigationNonce: 1,
    };

    interaction.syncSearchPresentation(presentation);
    expect(view.dispatch).toHaveBeenCalledTimes(2);
    expect(view.state.selection).toMatchObject({ from: result.matches[0].from, empty: true });

    interaction.syncSearchPresentation(presentation);
    expect(view.dispatch).toHaveBeenCalledTimes(3);

    interaction.syncSearchPresentation({ ...presentation, visible: false });
    expect(view.dispatch).toHaveBeenCalledTimes(4);

    interaction.syncSearchPresentation({
      ...presentation,
      token: { ...result.token, contentRevision: result.token.contentRevision - 1 },
    });
    expect(view.dispatch).toHaveBeenCalledTimes(5);
  });

  it("returns empty or unavailable search results for inactive and empty inputs", () => {
    const interaction = store();
    expect(interaction.querySearch({ term: "target", options: {} }).matches).toEqual([]);

    const view = makeView("target", 1, 1);
    interaction.attach(view as never, 1, "markdown", getDocumentAdapter("markdown"));
    expect(interaction.querySearch({ term: "", options: {} }).matches).toEqual([]);
    const current = interaction.querySearch({ term: "target", options: {} });
    expect(
      interaction.replaceSearch({
        replacement: "swap",
        matches: [],
        token: current.token,
        options: {},
      }),
    ).toEqual({ status: "unavailable" });

    interaction.setActive(false);
    expect(interaction.querySearch({ term: "target", options: {} }).matches).toEqual([]);
    expect(
      interaction.replaceSearch({
        replacement: "swap",
        matches: current.matches,
        token: current.token,
        options: {},
      }),
    ).toEqual({ status: "unavailable" });
    interaction.syncSearchPresentation({
      token: current.token,
      visible: true,
      searchTerm: "target",
      matches: current.matches,
      currentMatchIndex: 0,
      navigationNonce: 1,
    });
  });

  it("reports replacement failure and tolerates decoration dispatch after disposal", () => {
    const interaction = store();
    const view = makeView("target", 1, 1);
    interaction.attach(view as never, 1, "markdown", getDocumentAdapter("markdown"));
    const result = interaction.querySearch({ term: "target", options: {} });
    view.dispatch.mockImplementation(() => {
      throw new Error("destroyed");
    });

    expect(
      interaction.replaceSearch({
        replacement: "swap",
        matches: result.matches,
        token: result.token,
        options: {},
      }),
    ).toMatchObject({ status: "failed", error: expect.any(Error) });

    expect(() =>
      interaction.syncSearchPresentation({
        token: result.token,
        visible: true,
        searchTerm: "target",
        matches: result.matches,
        currentMatchIndex: 0,
        navigationNonce: 2,
      }),
    ).not.toThrow();
    expect(() => interaction.detach()).not.toThrow();
  });

  it("creates a viewport-bound POS highlight request for visible paragraphs", () => {
    const interaction = store();
    const view = makeViewFromState(
      EditorState.create({
        schema,
        doc: schema.node("doc", null, [
          schema.node("paragraph", null, schema.text("一段落")),
          schema.node("paragraph", null, schema.text("二段落")),
        ]),
      }),
    );
    interaction.attach(view as never, 2, "markdown", getDocumentAdapter("markdown"));

    const request = interaction.createPosHighlightRequest();
    expect(request).not.toBeNull();
    expect(request?.token).toMatchObject({
      editorId: "editor-a",
      generation: 2,
      contentRevision: 1,
      viewportRevision: 1,
    });
    expect(request?.segments).toEqual([
      expect.objectContaining({
        segmentType: "paragraph",
        pos: 0,
        text: "一段落",
      }),
      expect.objectContaining({
        segmentType: "paragraph",
        pos: 5,
        text: "二段落",
      }),
    ]);
  });

  it("maps plain-text POS highlight matches through paragraph offsets and stale guards", () => {
    const interaction = store("plain-text");
    const view = makeView("東京へ行く", 1, 1);
    const dispatch = vi.fn();
    interaction.setPosHighlightDispatcher(dispatch);
    interaction.attach(view as never, 3, "plain-text", getDocumentAdapter("plain-text"));

    const request = interaction.createPosHighlightRequest();
    expect(request?.segments).toHaveLength(1);

    interaction.syncPosHighlightPresentation({
      token: request!.token,
      request,
      matches: [
        { segmentIndex: 0, start: 0, end: 2, category: "名詞" },
        { segmentIndex: 0, start: 3, end: 5, category: "動詞" },
      ],
      colors: { 名詞: "#4A90E2", 動詞: "#27AE60" },
      disabledTypes: [],
      visible: true,
    });

    expect(dispatch).toHaveBeenLastCalledWith([
      { from: 1, to: 3, category: "名詞", color: "#4A90E2" },
      { from: 4, to: 6, category: "動詞", color: "#27AE60" },
    ]);

    interaction.update({ docChanged: true });
    interaction.syncPosHighlightPresentation({
      token: request!.token,
      request,
      matches: [{ segmentIndex: 0, start: 0, end: 2, category: "名詞" }],
      colors: { 名詞: "#4A90E2" },
      disabledTypes: [],
      visible: true,
    });

    expect(dispatch).toHaveBeenLastCalledWith([]);
  });
});
