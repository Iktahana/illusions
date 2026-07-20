/**
 * Tests for RubyDialog – NLP client failure handling.
 *
 * Issue #1456: dialog must gracefully handle getNlpClient() throwing,
 * show a Japanese error message, and disable the apply button.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// Mock nlp-client BEFORE importing RubyDialog
vi.mock("@/lib/nlp-client/nlp-client", () => ({
  getNlpClient: vi.fn(),
}));

import RubyDialog from "../RubyDialog";
import { getNlpClient } from "@/lib/nlp-client/nlp-client";

const mockGetNlpClient = vi.mocked(getNlpClient);

let root: Root;

beforeEach(() => {
  root = createRoot(document.body);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("RubyDialog – NLP client failure", () => {
  it("shows Japanese error message when getNlpClient throws", async () => {
    // Arrange: getNlpClient throws on initialization
    mockGetNlpClient.mockImplementation(() => {
      throw new Error("kuromoji init failed");
    });

    await act(async () => {
      root.render(
        <RubyDialog
          isOpen={true}
          onClose={() => {}}
          selectedText="漢字テスト"
          onApply={() => {}}
        />,
      );
    });

    // Assert: error message must be visible
    const body = document.body.textContent ?? "";
    expect(body).toContain("日本語解析エンジンの初期化に失敗しました");
  });

  it("disables apply button when getNlpClient throws", async () => {
    mockGetNlpClient.mockImplementation(() => {
      throw new Error("engine not ready");
    });

    await act(async () => {
      root.render(
        <RubyDialog
          isOpen={true}
          onClose={() => {}}
          selectedText="漢字テスト"
          onApply={() => {}}
        />,
      );
    });

    // Apply button must not be rendered (or must be disabled) when there is an error
    const applyButton = document.body.querySelector("button[data-apply]");
    if (applyButton) {
      // If button is rendered, it must be disabled
      expect((applyButton as HTMLButtonElement).disabled).toBe(true);
    } else {
      // Button should not be rendered at all in error state
      // Confirm no "適用" button is accessible
      const allButtons = Array.from(document.body.querySelectorAll("button"));
      const applyBtn = allButtons.find((b) => b.textContent?.trim() === "適用");
      expect(applyBtn).toBeUndefined();
    }
  });

  it("still renders dialog structure when getNlpClient throws", async () => {
    mockGetNlpClient.mockImplementation(() => {
      throw new Error("fatal error");
    });

    await act(async () => {
      root.render(
        <RubyDialog isOpen={true} onClose={() => {}} selectedText="テスト" onApply={() => {}} />,
      );
    });

    // Dialog heading must still be visible
    const body = document.body.textContent ?? "";
    expect(body).toContain("ルビ設定");
  });
});
