import { beforeEach, describe, expect, it, vi } from "vitest";

const trackUsageEvent = vi.hoisted(() => vi.fn());

vi.mock("../usage-events", () => ({
  trackUsageEvent,
}));

import { trackNoteOutputResult } from "../note-output-events";

describe("note output analytics", () => {
  beforeEach(() => {
    trackUsageEvent.mockReset();
  });

  it.each([
    ["export", "/Users/alice/private/作品_note.txt"],
    ["copy", { success: true }],
  ] as const)("tracks one successful %s with fixed anonymous props", (operation, result) => {
    trackNoteOutputResult(operation, result);

    expect(trackUsageEvent).toHaveBeenCalledOnce();
    expect(trackUsageEvent).toHaveBeenCalledWith("note_output_completed", {
      operation,
      format: "note",
    });
  });

  it.each([
    ["cancelled", null, "note_output_cancelled", undefined],
    ["unavailable", undefined, "note_output_cancelled", undefined],
    [
      "failed",
      { success: false, error: "clipboard contents: 秘密" },
      "note_output_failed",
      "unknown",
    ],
  ] as const)("tracks a safe %s note outcome", (_label, result, eventName, reason) => {
    trackNoteOutputResult("export", result);

    expect(trackUsageEvent).toHaveBeenCalledWith(eventName, {
      operation: "export",
      format: "note",
      ...(reason ? { reason } : {}),
    });
  });

  it("never forwards paths, titles, content, clipboard data, or errors", () => {
    const result = Object.assign(
      { success: true },
      {
        path: "/Users/alice/private/作品_note.txt",
        title: "非公開ノート",
        content: "本文",
        clipboardText: "クリップボード本文",
        error: new Error("private failure"),
      },
    );

    trackNoteOutputResult("copy", result);

    expect(trackUsageEvent).toHaveBeenCalledWith("note_output_completed", {
      operation: "copy",
      format: "note",
    });
  });
});
