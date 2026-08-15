import { describe, expect, it } from "vitest";
import { Schema } from "@milkdown/prose/model";
import { EditorState } from "@milkdown/prose/state";
import { Decoration } from "@milkdown/prose/view";
import {
  SPEECH_DECORATIONS_META,
  speechHighlightPlugin,
  speechHighlightPluginKey,
} from "../speech-highlight-plugin";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*" },
    text: {},
  },
});

function state(text = "読み上げテスト"): EditorState {
  return EditorState.create({
    schema,
    doc: schema.node("doc", null, [schema.node("paragraph", null, schema.text(text))]),
    plugins: [speechHighlightPlugin],
  });
}

describe("speechHighlightPlugin", () => {
  it("publishes and clears the current speech range", () => {
    let current = state();
    const decoration = Decoration.inline(1, 4, { class: "speech-reading" });
    current = current.apply(current.tr.setMeta(SPEECH_DECORATIONS_META, [decoration]));
    expect(speechHighlightPluginKey.getState(current)?.find()).toHaveLength(1);

    current = current.apply(current.tr.setMeta(SPEECH_DECORATIONS_META, []));
    expect(speechHighlightPluginKey.getState(current)?.find()).toHaveLength(0);
  });

  it("maps a live decoration through document edits", () => {
    let current = state();
    current = current.apply(
      current.tr.setMeta(SPEECH_DECORATIONS_META, [
        Decoration.inline(2, 4, { class: "speech-reading" }),
      ]),
    );
    current = current.apply(current.tr.insertText("先", 1));
    expect(speechHighlightPluginKey.getState(current)?.find()[0]).toMatchObject({
      from: 3,
      to: 5,
    });
  });
});
