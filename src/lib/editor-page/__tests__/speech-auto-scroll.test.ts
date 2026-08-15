import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelSpeechScroll, scrollToSpeechTarget } from "../speech-auto-scroll";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height } as DOMRect;
}

describe("scrollToSpeechTarget", () => {
  let frame: FrameRequestCallback | null;

  beforeEach(() => {
    frame = null;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(performance, "now").mockReturnValue(0);
  });

  afterEach(() => {
    cancelSpeechScroll();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not move a comfortable horizontal target", () => {
    const container = document.createElement("div");
    const target = document.createElement("span");
    container.getBoundingClientRect = () => rect(0, 0, 500, 400);
    target.getBoundingClientRect = () => rect(20, 180, 10, 10);
    scrollToSpeechTarget({ container, target, isVertical: false });
    expect(frame).toBeNull();
  });

  it("scrolls toward the vertical reading side", () => {
    const container = document.createElement("div");
    const target = document.createElement("span");
    Object.defineProperty(container, "scrollLeft", { value: 0, writable: true });
    container.getBoundingClientRect = () => rect(0, 0, 400, 500);
    target.getBoundingClientRect = () => rect(10, 20, 10, 10);
    scrollToSpeechTarget({ container, target, isVertical: true, duration: 100 });
    expect(frame).not.toBeNull();
    frame?.(100);
    expect(container.scrollLeft).toBeLessThan(0);
  });

  it("animates an offscreen horizontal target and cancels an active frame", () => {
    const container = document.createElement("div");
    const target = document.createElement("span");
    Object.defineProperty(container, "scrollTop", { value: 10, writable: true });
    container.getBoundingClientRect = () => rect(0, 0, 400, 400);
    target.getBoundingClientRect = () => rect(20, 390, 10, 10);

    scrollToSpeechTarget({ container, target, isVertical: false, duration: 100 });
    expect(frame).not.toBeNull();
    frame?.(50);
    expect(container.scrollTop).toBeGreaterThan(10);
    expect(frame).not.toBeNull();

    cancelSpeechScroll();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
  });

  it("does not move a comfortable vertical target", () => {
    const container = document.createElement("div");
    const target = document.createElement("span");
    container.getBoundingClientRect = () => rect(0, 0, 400, 500);
    target.getBoundingClientRect = () => rect(195, 20, 10, 10);

    scrollToSpeechTarget({ container, target, isVertical: true });

    expect(frame).toBeNull();
  });
});
