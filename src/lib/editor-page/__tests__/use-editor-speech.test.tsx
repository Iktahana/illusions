import React, { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Schema } from "@milkdown/prose/model";
import { EditorState, TextSelection } from "@milkdown/prose/state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDocumentAdapter } from "@/lib/document-format";
import { EditorInteractionStore } from "@/lib/editor-interaction";
import { speechHighlightPlugin, speechHighlightPluginKey } from "../speech-highlight-plugin";

const mocks = vi.hoisted(() => ({
  speakSegments: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("@/contexts/EditorSettingsContext", () => ({
  useSpeechSettings: () => ({
    speechVoiceURI: "",
    speechRate: 1,
    speechPitch: 1,
    speechVolume: 1,
  }),
}));
vi.mock("@/lib/hooks/use-speech", () => ({
  useSpeech: () => ({
    state: { isPlaying: false, isPaused: false, isSupported: true },
    speakSegments: mocks.speakSegments,
    pause: mocks.pause,
    resume: mocks.resume,
    stop: mocks.stop,
  }),
}));
vi.mock("../speech-auto-scroll", () => ({
  cancelSpeechScroll: vi.fn(),
  scrollToSpeechTarget: vi.fn(),
}));

import { useEditorSpeech } from "../use-editor-speech";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*" },
    text: {},
  },
});

function createView() {
  let state = EditorState.create({
    schema,
    doc: schema.node("doc", null, [schema.node("paragraph", null, schema.text("読み上げる文章"))]),
    plugins: [speechHighlightPlugin],
  });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 5)));
  const target = document.createElement("span");
  const view = {
    state,
    isDestroyed: false,
    dispatch: vi.fn((transaction) => {
      view.state = view.state.apply(transaction);
    }),
    coordsAtPos: vi.fn(() => ({ left: 0, right: 1, top: 0, bottom: 1 })),
    hasFocus: vi.fn(() => true),
    domAtPos: vi.fn(() => ({ node: target })),
    dom: document.createElement("div"),
  };
  return view;
}

function Harness({ interaction }: { interaction: EditorInteractionStore }) {
  const surface = useRef<HTMLDivElement>(null);
  useEditorSpeech({ interaction, isVertical: false, editorSurface: surface });
  return <div ref={surface} />;
}

describe("useEditorSpeech", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("reads only the current selection and clears the session when the pane becomes inactive", () => {
    const interaction = new EditorInteractionStore(
      "speech-editor",
      "mdi",
      getDocumentAdapter("mdi"),
    );
    const view = createView();
    interaction.attach(view as never, 4, "mdi", getDocumentAdapter("mdi"));
    act(() => root.render(<Harness interaction={interaction} />));

    const token = interaction.getSnapshot().selection.token;
    expect(interaction.execute({ id: "speech.toggle" }, token)).toEqual({ status: "executed" });
    expect(mocks.speakSegments).toHaveBeenCalledWith(["読み上げ"], expect.any(Object));

    const callbacks = mocks.speakSegments.mock.calls[0][1];
    act(() => callbacks.onSegmentStart(0));
    expect(speechHighlightPluginKey.getState(view.state)?.find()).toHaveLength(1);

    act(() => interaction.setActive(false));
    expect(mocks.stop).toHaveBeenCalled();
    expect(speechHighlightPluginKey.getState(view.state)?.find()).toHaveLength(0);
  });

  it("does not execute against an old selection revision", () => {
    const interaction = new EditorInteractionStore(
      "speech-editor",
      "markdown",
      getDocumentAdapter("markdown"),
    );
    interaction.attach(createView() as never, 1, "markdown", getDocumentAdapter("markdown"));
    act(() => root.render(<Harness interaction={interaction} />));
    const stale = interaction.getSnapshot().selection.token;
    interaction.update();
    expect(interaction.execute({ id: "speech.toggle" }, stale)).toEqual({ status: "stale" });
    expect(mocks.speakSegments).not.toHaveBeenCalled();
  });
});
