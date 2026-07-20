import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorReportingRuntime } from "../ErrorReportingRuntime";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const captureRendererErrorMock = vi.fn().mockResolvedValue(undefined);

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  captureRendererErrorMock.mockClear();
  (window as unknown as { electronAPI?: unknown }).electronAPI = {
    errorReporting: {
      captureRendererError: captureRendererErrorMock,
    },
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});

describe("ErrorReportingRuntime", () => {
  it("captures document CSP violations as renderer errors", async () => {
    await act(async () => {
      root.render(<ErrorReportingRuntime />);
    });

    const event = Object.assign(new Event("securitypolicyviolation"), {
      violatedDirective: "connect-src",
      blockedURI: "https://blocked.example.test/report",
    });

    document.dispatchEvent(event);

    expect(captureRendererErrorMock).toHaveBeenCalledWith({
      source: "csp-violation",
      name: "SecurityPolicyViolation",
      message: "CSP violation: connect-src blocked https://blocked.example.test/report",
    });
  });
});
