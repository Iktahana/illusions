/**
 * Regression tests for GlassDialog accessible dialog (#1881)
 *
 * Verifies:
 * - role="dialog" and aria-modal="true" are on the panel element
 * - Focus moves into the dialog on open
 * - Tab from last focusable wraps to first (focus trap)
 * - Shift+Tab from first focusable wraps to last
 * - Background siblings become inert while dialog is open
 * - Focus is returned to the originating element on close
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import GlassDialog from "../GlassDialog";

let root: Root;
let container: HTMLDivElement;

function fireKeyDown(key: string, shiftKey = false): void {
  const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true });
  document.dispatchEvent(event);
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("GlassDialog – accessible dialog focus trap (#1881)", () => {
  it("renders with role=dialog and aria-modal=true on the panel when open", async () => {
    await act(async () => {
      root.render(
        <GlassDialog isOpen={true} ariaLabel="テストダイアログ">
          <button>OK</button>
        </GlassDialog>,
      );
    });

    const dialog = document.querySelector("[role='dialog']");
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-label")).toBe("テストダイアログ");
  });

  it("renders nothing when isOpen is false", async () => {
    await act(async () => {
      root.render(
        <GlassDialog isOpen={false}>
          <button>OK</button>
        </GlassDialog>,
      );
    });

    const dialog = document.querySelector("[role='dialog']");
    expect(dialog).toBeNull();
  });

  it("moves focus into the dialog when opened", async () => {
    const triggerBtn = document.createElement("button");
    triggerBtn.textContent = "ダイアログを開く";
    document.body.appendChild(triggerBtn);
    triggerBtn.focus();
    expect(document.activeElement).toBe(triggerBtn);

    await act(async () => {
      root.render(
        <GlassDialog isOpen={true}>
          <button data-testid="first-btn">最初のボタン</button>
          <button data-testid="second-btn">次のボタン</button>
        </GlassDialog>,
      );
    });

    // Wait for requestAnimationFrame-based focus shift
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });

    const dialog = document.querySelector<HTMLElement>("[role='dialog']");
    expect(dialog?.contains(document.activeElement)).toBe(true);
  });

  it("focus trap: Tab from last focusable wraps to first", async () => {
    await act(async () => {
      root.render(
        <GlassDialog isOpen={true}>
          <button data-testid="btn-a">A</button>
          <button data-testid="btn-b">B</button>
          <button data-testid="btn-c">C</button>
        </GlassDialog>,
      );
    });

    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });

    const dialog = document.querySelector<HTMLElement>("[role='dialog']");
    const focusable = dialog
      ? Array.from(
          dialog.querySelectorAll<HTMLElement>(
            "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
          ),
        )
      : [];

    expect(focusable.length).toBeGreaterThan(0);

    // Focus the last element
    const last = focusable[focusable.length - 1];
    last.focus();
    expect(document.activeElement).toBe(last);

    // Tab should wrap to first
    fireKeyDown("Tab", false);

    expect(document.activeElement).toBe(focusable[0]);
  });

  it("focus trap: Shift+Tab from first focusable wraps to last", async () => {
    await act(async () => {
      root.render(
        <GlassDialog isOpen={true}>
          <button data-testid="btn-a">A</button>
          <button data-testid="btn-b">B</button>
          <button data-testid="btn-c">C</button>
        </GlassDialog>,
      );
    });

    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });

    const dialog = document.querySelector<HTMLElement>("[role='dialog']");
    const focusable = dialog
      ? Array.from(
          dialog.querySelectorAll<HTMLElement>(
            "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
          ),
        )
      : [];

    expect(focusable.length).toBeGreaterThan(0);

    // Focus the first element
    const first = focusable[0];
    first.focus();
    expect(document.activeElement).toBe(first);

    // Shift+Tab should wrap to last
    fireKeyDown("Tab", true);

    expect(document.activeElement).toBe(focusable[focusable.length - 1]);
  });

  it("background sibling receives inert attribute while dialog is open", async () => {
    // Render the dialog first so the overlay element is created
    await act(async () => {
      root.render(
        <GlassDialog isOpen={true}>
          <button>OK</button>
        </GlassDialog>,
      );
    });

    // Find the overlay element and its parent to add a sibling there
    const overlay = document.querySelector<HTMLElement>("[data-glass-dialog-overlay]");
    expect(overlay).not.toBeNull();

    const overlayParent = overlay!.parentElement!;
    const background = document.createElement("div");
    background.setAttribute("data-testid", "background");
    overlayParent.appendChild(background);

    // Re-render to trigger the effect with the new sibling
    await act(async () => {
      root.render(
        <GlassDialog isOpen={false}>
          <button>OK</button>
        </GlassDialog>,
      );
    });
    await act(async () => {
      root.render(
        <GlassDialog isOpen={true}>
          <button>OK</button>
        </GlassDialog>,
      );
    });

    // The background sibling of the overlay should be inert
    expect(background.hasAttribute("inert")).toBe(true);

    background.remove();
  });

  it("restores focus to originating element on close", async () => {
    const triggerBtn = document.createElement("button");
    triggerBtn.textContent = "ダイアログを開く";
    document.body.appendChild(triggerBtn);
    triggerBtn.focus();

    const onClose = vi.fn();

    // Open
    await act(async () => {
      root.render(
        <GlassDialog isOpen={true} onBackdropClick={onClose}>
          <button>OK</button>
        </GlassDialog>,
      );
    });

    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });

    // Close
    await act(async () => {
      root.render(
        <GlassDialog isOpen={false} onBackdropClick={onClose}>
          <button>OK</button>
        </GlassDialog>,
      );
    });

    expect(document.activeElement).toBe(triggerBtn);
  });

  it("Escape key calls onBackdropClick", async () => {
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <GlassDialog isOpen={true} onBackdropClick={onClose}>
          <button>OK</button>
        </GlassDialog>,
      );
    });

    fireKeyDown("Escape");

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Tab key does not escape to background elements", async () => {
    // Add a focusable element outside the dialog
    const outsideBtn = document.createElement("button");
    outsideBtn.textContent = "外部ボタン";
    outsideBtn.setAttribute("data-testid", "outside-btn");
    document.body.appendChild(outsideBtn);

    await act(async () => {
      root.render(
        <GlassDialog isOpen={true}>
          <button data-testid="only-btn">唯一のボタン</button>
        </GlassDialog>,
      );
    });

    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });

    const dialog = document.querySelector<HTMLElement>("[role='dialog']");
    const onlyBtn = dialog?.querySelector<HTMLElement>("[data-testid='only-btn']");
    expect(onlyBtn).not.toBeNull();

    onlyBtn!.focus();
    expect(document.activeElement).toBe(onlyBtn);

    // Tab from only button should wrap back to it (not escape to outsideBtn)
    fireKeyDown("Tab", false);
    expect(document.activeElement).toBe(onlyBtn);
    expect(document.activeElement).not.toBe(outsideBtn);

    outsideBtn.remove();
  });
});
