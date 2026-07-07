import { describe, it, expect } from "vitest";

import {
  sanitizeErrorText,
  scrubRendererErrorPayload,
  scrubSentryEvent,
} from "../scrub-error-event";

describe("sanitizeErrorText", () => {
  it("replaces file paths and mdi file names", () => {
    const value = [
      "Error: failed to save /Users/test/Novel/第三章.mdi",
      "at saveFile (C:\\Users\\test\\Novel\\第四章.mdi:10:2)",
    ].join("\n");

    const sanitized = sanitizeErrorText(value);

    expect(sanitized).not.toContain("/Users/test/Novel/第三章.mdi");
    expect(sanitized).not.toContain("C:\\Users\\test\\Novel\\第四章.mdi");
    expect(sanitized).toContain("[file].mdi");
    expect(sanitized).toContain("[path]");
  });
});

describe("scrubSentryEvent", () => {
  it("drops high-risk fields and preserves safe metadata", () => {
    const event = {
      release: "1.2.0",
      platform: "darwin",
      user: { email: "user@example.com" },
      request: { url: "file:///Users/test/Novel/第三章.mdi" },
      breadcrumbs: [{ message: "clicked 第三章.mdi" }],
      tags: { process: "renderer" },
      extra: {
        filePath: "/Users/test/Novel/第三章.mdi",
        note: "opened 第三章.mdi",
      },
      exception: {
        values: [
          {
            type: "Error",
            value: "failed to open /Users/test/Novel/第三章.mdi",
            stacktrace: {
              frames: [
                {
                  filename: "/Users/test/Novel/第三章.mdi",
                  function: "openDocument",
                },
              ],
            },
          },
        ],
      },
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed).not.toBeNull();
    expect(scrubbed?.release).toBe("1.2.0");
    expect(scrubbed?.platform).toBe("darwin");
    expect(scrubbed?.tags).toEqual({ process: "renderer" });
    expect(scrubbed).not.toHaveProperty("user");
    expect(scrubbed).not.toHaveProperty("request");
    expect(scrubbed).not.toHaveProperty("breadcrumbs");
    expect(scrubbed?.extra).toEqual({
      filePath: "[path]/[file].mdi",
      note: "opened [file].mdi",
    });
    expect(scrubbed?.exception.values[0].value).toContain("[file].mdi");
    expect(scrubbed?.exception.values[0].stacktrace.frames[0].filename).toBe("[path]/[file].mdi");
  });
});

describe("scrubRendererErrorPayload", () => {
  it("sanitizes message and stack while preserving source and section name", () => {
    const payload = {
      source: "error-boundary" as const,
      sectionName: "エディタ",
      message: "failed to load /Users/test/Novel/第三章.mdi",
      stack: "at render (C:\\Users\\test\\Novel\\第四章.mdi:12:1)",
    };

    const scrubbed = scrubRendererErrorPayload(payload);

    expect(scrubbed.source).toBe("error-boundary");
    expect(scrubbed.sectionName).toBe("エディタ");
    expect(scrubbed.message).toContain("[file].mdi");
    expect(scrubbed.message).not.toContain("第三章.mdi");
    expect(scrubbed.stack).toContain("[path]");
    expect(scrubbed.stack).toContain("[file].mdi");
  });
});
