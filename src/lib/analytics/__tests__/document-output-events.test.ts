import { beforeEach, describe, expect, it, vi } from "vitest";

const trackUsageEvent = vi.hoisted(() => vi.fn());

vi.mock("../usage-events", () => ({
  trackUsageEvent,
}));

import { trackDocumentOutputResult } from "../document-output-events";

describe("document output analytics", () => {
  beforeEach(() => {
    trackUsageEvent.mockReset();
  });

  it("tracks a completed file export without forwarding its path", () => {
    trackDocumentOutputResult("export", "epub", "/Users/alice/private/novel.epub");

    expect(trackUsageEvent).toHaveBeenCalledOnce();
    expect(trackUsageEvent).toHaveBeenCalledWith("document_output_completed", {
      operation: "export",
      format: "epub",
    });
  });

  it("tracks a completed formatted clipboard copy", () => {
    trackDocumentOutputResult("copy", "kakuyomu", { success: true });

    expect(trackUsageEvent).toHaveBeenCalledWith("document_output_completed", {
      operation: "copy",
      format: "kakuyomu",
    });
  });

  it.each([
    ["cancelled", null],
    ["unavailable", undefined],
    ["failed", { success: false, error: "/Users/alice/private/novel.mdi" }],
  ] as const)("does not track a %s output", (_label, result) => {
    trackDocumentOutputResult("export", "pdf", result);

    expect(trackUsageEvent).not.toHaveBeenCalled();
  });
});
