import React, { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Schema } from "@milkdown/prose/model";
import { EditorState, TextSelection } from "@milkdown/prose/state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDocumentAdapter } from "@/lib/document-format";
import { EditorInteractionStore } from "@/lib/editor-interaction";
import { speechHighlightPlugin, speechHighlightPluginKey } from "../speech-highlight-plugin";

const mocks = vi.hoisted(() => ({
  state: { isPlaying: false, isPaused: false, isSupported: true },
  speakSegments: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  cancelSpeechScroll: vi.fn(),
  scrollToSpeechTarget: vi.fn(),
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
    state: mocks.state,
    speakSegments: mocks.speakSegments,
    pause: mocks.pause,
    resume: mocks.resume,
    stop: mocks.stop,
  }),
}));
vi.mock("../speech-auto-scroll", () => ({
  cancelSpeechScroll: mocks.cancelSpeechScroll,
  scrollToSpeechTarget: mocks.scrollToSpeechTarget,
}));

import { useEditorSpeech } from "../use-editor-speech";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*" },
    text: {},
  },
});

function createView({ nestedScroller = false }: { nestedScroller?: boolean } = {}) {
  let state = EditorState.create({
    schema,
    doc: schema.node("doc", null, [schema.node("paragraph", null, schema.text("読み上げる文章"))]),
    plugins: [speechHighlightPlugin],
  });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 5)));
  const target = document.createElement("span");
  if (nestedScroller) {
    const scroller = document.createElement("div");
    scroller.style.overflow = "auto";
    scroller.appendChild(target);
  }
  const view = {
    state,
    isDestroyed: false as boolean,
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
  const speech = useEditorSpeech({ interaction, isVertical: false, editorSurface: surface });
  return (
    <div ref={surface}>
      <button type="button" aria-label="toggle speech" onClick={speech.toggle} />
      <button type="button" aria-label="stop speech" onClick={speech.stop} />
    </div>
  );
}

describe("useEditorSpeech", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    Object.assign(mocks.state, { isPlaying: false, isPaused: false, isSupported: true });
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

  it("routes play, pause, resume, and stop through the shared executor", () => {
    const interaction = new EditorInteractionStore(
      "speech-controls",
      "markdown",
      getDocumentAdapter("markdown"),
    );
    const view = createView();
    interaction.attach(view as never, 2, "markdown", getDocumentAdapter("markdown"));

    mocks.state.isPlaying = true;
    act(() => root.render(<Harness interaction={interaction} />));
    let token = interaction.getSnapshot().selection.token;
    expect(interaction.execute({ id: "speech.toggle" }, token)).toEqual({ status: "executed" });
    expect(mocks.pause).toHaveBeenCalledOnce();

    mocks.state.isPlaying = false;
    mocks.state.isPaused = true;
    act(() => root.render(<Harness interaction={interaction} />));
    token = interaction.getSnapshot().selection.token;
    expect(interaction.execute({ id: "speech.toggle" }, token)).toEqual({ status: "executed" });
    expect(mocks.resume).toHaveBeenCalledOnce();

    expect(interaction.execute({ id: "speech.stop" })).toEqual({ status: "executed" });
    expect(mocks.stop).toHaveBeenCalled();
    expect(mocks.cancelSpeechScroll).toHaveBeenCalled();
  });

  it("uses the public toggle and follows a nested editor scroller", () => {
    const interaction = new EditorInteractionStore(
      "speech-toggle",
      "mdi",
      getDocumentAdapter("mdi"),
    );
    const view = createView({ nestedScroller: true });
    interaction.attach(view as never, 3, "mdi", getDocumentAdapter("mdi"));
    act(() => root.render(<Harness interaction={interaction} />));

    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="toggle speech"]')?.click();
    });
    const callbacks = mocks.speakSegments.mock.calls[0][1];
    act(() => callbacks.onSegmentStart(0));
    expect(mocks.scrollToSpeechTarget).toHaveBeenCalledWith(
      expect.objectContaining({ isVertical: false }),
    );

    act(() => callbacks.onEnd());
    expect(speechHighlightPluginKey.getState(view.state)?.find()).toHaveLength(0);
  });

  it("stops stale playback callbacks and surfaces synthesis errors", () => {
    const interaction = new EditorInteractionStore(
      "speech-stale-callback",
      "markdown",
      getDocumentAdapter("markdown"),
    );
    const view = createView();
    interaction.attach(view as never, 5, "markdown", getDocumentAdapter("markdown"));
    act(() => root.render(<Harness interaction={interaction} />));
    const token = interaction.getSnapshot().selection.token;
    interaction.execute({ id: "speech.toggle" }, token);
    const callbacks = mocks.speakSegments.mock.calls[0][1];

    view.isDestroyed = true;
    act(() => callbacks.onSegmentStart(0));
    expect(mocks.stop).toHaveBeenCalled();

    view.isDestroyed = false;
    act(() => callbacks.onError());
    expect(mocks.stop).toHaveBeenCalledTimes(3);
  });

  it("does not register speech commands when Web Speech is unavailable", () => {
    mocks.state.isSupported = false;
    const interaction = new EditorInteractionStore(
      "speech-unsupported",
      "markdown",
      getDocumentAdapter("markdown"),
    );
    interaction.attach(createView() as never, 1, "markdown", getDocumentAdapter("markdown"));
    act(() => root.render(<Harness interaction={interaction} />));

    expect(interaction.getSnapshot().availability["speech.toggle"]).toBe(false);
    expect(interaction.getSnapshot().availability["speech.stop"]).toBe(false);
  });
});
