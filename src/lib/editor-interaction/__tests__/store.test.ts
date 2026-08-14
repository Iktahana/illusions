import { Schema } from "@milkdown/prose/model";
import { EditorState, TextSelection } from "@milkdown/prose/state";
import { describe, expect, it, vi } from "vitest";
import { getDocumentAdapter, type DocumentFormat } from "@/lib/document-format";
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

function makeView(text = "選択範囲", from = 1, to = 3) {
  let state = EditorState.create({
    schema,
    doc: schema.node("doc", null, [schema.node("paragraph", null, schema.text(text))]),
  });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
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
  };
  return view;
}

function store(format: DocumentFormat = "markdown") {
  return new EditorInteractionStore("editor-a", format, getDocumentAdapter(format));
}

describe("EditorInteractionStore", () => {
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
    expect(
      interaction.execute({ id: "format.strong" }, interaction.getSnapshot().selection.token),
    ).toEqual({ status: "unavailable" });
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
});
