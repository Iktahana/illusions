import { beforeEach, describe, expect, it, vi } from "vitest";

import { ElectronNlpClient } from "@/platform/electron-renderer/nlp-client";

function installNlpBridge() {
  const nlp = {
    init: vi.fn(),
    tokenizeParagraph: vi.fn().mockResolvedValue([]),
    tokenizeDocument: vi.fn().mockResolvedValue([]),
    analyzeWordFrequency: vi.fn().mockResolvedValue([]),
  };

  Object.defineProperty(window, "electronAPI", {
    configurable: true,
    value: { isElectron: true, nlp },
  });

  return nlp;
}

describe("ElectronNlpClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "electronAPI");
  });

  it("is safe to construct without a browser or preload bridge", () => {
    expect(() => new ElectronNlpClient()).not.toThrow();
  });

  it("fails an operation with an actionable NLP bridge error", async () => {
    const client = new ElectronNlpClient();

    await expect(client.tokenizeParagraph("本文")).rejects.toThrow(
      "window.electronAPI.nlp was not exposed",
    );
  });

  it("identifies a missing NLP sub-bridge", async () => {
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { isElectron: true },
    });
    const client = new ElectronNlpClient();

    await expect(client.analyzeWordFrequency("本文")).rejects.toThrow(
      "Ensure the Electron preload script exposes the NLP IPC bridge.",
    );
  });

  it("delegates operations to the exposed NLP bridge", async () => {
    const nlp = installNlpBridge();
    const client = new ElectronNlpClient();
    const paragraphs = [{ pos: 0, text: "本文" }];
    const onProgress = vi.fn();

    await expect(client.tokenizeParagraph("本文")).resolves.toEqual([]);
    await expect(client.tokenizeDocument(paragraphs, onProgress)).resolves.toEqual([]);
    await expect(client.analyzeWordFrequency("本文")).resolves.toEqual([]);

    expect(nlp.tokenizeParagraph).toHaveBeenCalledWith("本文");
    expect(nlp.tokenizeDocument).toHaveBeenCalledWith(paragraphs, onProgress);
    expect(nlp.analyzeWordFrequency).toHaveBeenCalledWith("本文");
  });
});
