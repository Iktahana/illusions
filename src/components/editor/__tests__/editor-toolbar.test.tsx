import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({
  fontScale: 100,
  lineHeight: 1.8,
  paragraphSpacing: 0.5,
  onFontScaleChange: vi.fn(),
  onLineHeightChange: vi.fn(),
  onParagraphSpacingChange: vi.fn(),
}));

vi.mock("@/contexts/EditorSettingsContext", () => ({ useTypographySettings: () => settings }));
import EditorToolbar from "../EditorToolbar";

describe("EditorToolbar", () => {
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
  const render = (isVertical = false, toggle = vi.fn()) => {
    act(() => root.render(<EditorToolbar isVertical={isVertical} onToggleWritingMode={toggle} />));
    return toggle;
  };

  it("exposes Japanese names and keeps writing mode first", () => {
    render();
    const toolbar = container.querySelector('[role="toolbar"]');
    expect(toolbar?.getAttribute("aria-label")).toBe("エディター表示");
    expect(toolbar?.querySelector("button")?.getAttribute("aria-label")).toBe("縦書きに切り替え");
    expect(toolbar?.className).toContain("overflow-x-auto");
  });

  it("toggles writing mode without owning editor state", () => {
    const toggle = render(true);
    const button = container.querySelector(
      'button[aria-label="横書きに切り替え"]',
    ) as HTMLButtonElement;
    act(() => button.click());
    expect(toggle).toHaveBeenCalledOnce();
  });

  it("updates typography through shared settings handlers", () => {
    render();
    const picker = container.querySelector('button[aria-label="文字 100%"]') as HTMLButtonElement;
    act(() => picker.click());
    const option = container.querySelector(
      'button[aria-label="文字 100%: 125"]',
    ) as HTMLButtonElement;
    act(() => option.click());
    expect(settings.onFontScaleChange).toHaveBeenCalledWith(125);
  });

  it("exposes accessible speech pause and stop controls only when supported", () => {
    const toggleSpeech = vi.fn();
    const stopSpeech = vi.fn();
    act(() =>
      root.render(
        <EditorToolbar
          isVertical={false}
          onToggleWritingMode={vi.fn()}
          speechState={{ isSupported: true, isPlaying: true, isPaused: false }}
          onToggleSpeech={toggleSpeech}
          onStopSpeech={stopSpeech}
        />,
      ),
    );
    const pause = container.querySelector(
      'button[aria-label="読み上げを一時停止"]',
    ) as HTMLButtonElement;
    const stop = container.querySelector(
      'button[aria-label="読み上げを停止"]',
    ) as HTMLButtonElement;
    act(() => {
      pause.click();
      stop.click();
    });
    expect(toggleSpeech).toHaveBeenCalledOnce();
    expect(stopSpeech).toHaveBeenCalledOnce();
  });
});
