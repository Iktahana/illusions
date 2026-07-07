import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import BugReportDialog from "../BugReportDialog";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const submitBugReportMock = vi.fn();
const showMessageMock = vi.fn();

vi.mock("@/lib/bug-report/submit-bug-report", () => ({
  submitBugReport: (...args: unknown[]) => submitBugReportMock(...args),
  collectDiagnostics: () => ({ appVersion: "1.4.2", os: "mac" }),
}));

vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: { showMessage: (...args: unknown[]) => showMessageMock(...args) },
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  submitBugReportMock.mockReset();
  showMessageMock.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function getSubmitButton(): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll("button"));
  const submit = buttons.find((b) => b.textContent?.includes("送信"));
  if (!submit) throw new Error("送信ボタンが見つかりません");
  return submit as HTMLButtonElement;
}

describe("BugReportDialog", () => {
  it("診断情報 (バージョン/OS) を明示し、原稿を送らない旨を表示する", async () => {
    await act(async () => {
      root.render(<BugReportDialog isOpen initialCategory="bug" onClose={vi.fn()} />);
    });

    expect(container.textContent).toContain("アプリバージョン 1.4.2");
    expect(container.textContent).toContain("macOS");
    expect(container.textContent).toContain("原稿の内容やファイルパスは送信されません");
  });

  it("initialCategory を select の初期値に反映する", async () => {
    await act(async () => {
      root.render(<BugReportDialog isOpen initialCategory="ai-inappropriate" onClose={vi.fn()} />);
    });

    const select = container.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("ai-inappropriate");
  });

  it("タイトル・詳細が未入力なら送信ボタンが無効", async () => {
    await act(async () => {
      root.render(<BugReportDialog isOpen initialCategory="bug" onClose={vi.fn()} />);
    });

    expect(getSubmitButton().disabled).toBe(true);
  });

  it("送信成功で submitBugReport を呼び、成功トーストを出して閉じる", async () => {
    submitBugReportMock.mockResolvedValue({ ok: true, status: 200 });
    const onClose = vi.fn();

    await act(async () => {
      root.render(<BugReportDialog isOpen initialCategory="bug" onClose={onClose} />);
    });

    const title = container.querySelector('input[type="text"]') as HTMLInputElement;
    const description = container.querySelector("textarea") as HTMLTextAreaElement;

    await act(async () => {
      setInputValue(title, "クラッシュ");
      setTextareaValue(description, "起動でクラッシュ");
    });

    expect(getSubmitButton().disabled).toBe(false);

    await act(async () => {
      getSubmitButton().click();
    });

    expect(submitBugReportMock).toHaveBeenCalledTimes(1);
    expect(submitBugReportMock.mock.calls[0][0]).toMatchObject({
      category: "bug",
      title: "クラッシュ",
      description: "起動でクラッシュ",
    });
    expect(showMessageMock).toHaveBeenCalledWith(expect.any(String), { type: "success" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("送信失敗ではエラートーストを出し、閉じない", async () => {
    submitBugReportMock.mockResolvedValue({ ok: false });
    const onClose = vi.fn();

    await act(async () => {
      root.render(<BugReportDialog isOpen initialCategory="bug" onClose={onClose} />);
    });

    const title = container.querySelector('input[type="text"]') as HTMLInputElement;
    const description = container.querySelector("textarea") as HTMLTextAreaElement;

    await act(async () => {
      setInputValue(title, "t");
      setTextareaValue(description, "d");
    });

    await act(async () => {
      getSubmitButton().click();
    });

    expect(showMessageMock).toHaveBeenCalledWith(expect.any(String), { type: "error" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

// React が管理する input/textarea の値を native setter 経由で更新する
function setInputValue(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function setTextareaValue(el: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
