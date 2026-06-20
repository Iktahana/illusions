/**
 * Regression tests for SettingsModal accessible dialog (#1851)
 *
 * Verifies:
 * - role="dialog" and aria-modal="true" are present
 * - Focus moves into the modal on open
 * - Tab from last focusable wraps to first (focus trap)
 * - Shift+Tab from first focusable wraps to last
 * - Background siblings become inert while modal is open
 * - Focus is returned to the originating element on close
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// SettingsModal depends on several sub-modules — mock heavy ones.
vi.mock("@/lib/utils/runtime-env", () => ({
  isElectronRenderer: () => false,
}));

vi.mock("@/components/settings/nav-config", () => ({
  buildSettingsNavConfig: () => [],
}));

vi.mock("@/components/settings/tab-registry", () => ({
  buildSettingsTabRegistry: () => ({
    account: {
      component: () => React.createElement("div", { "data-testid": "tab-content" }, "タブ内容"),
      wide: false,
    },
  }),
}));

vi.mock("@/components/settings/settings-category", () => ({
  resolveLegacyCategory: (_cat: unknown) => "account",
}));

vi.mock("@/components/settings/primitives", () => ({
  SettingsNav: ({
    "aria-label": ariaLabel,
  }: {
    "aria-label"?: string;
    groups: unknown[];
    active: unknown;
    onSelect: (cat: unknown) => void;
  }) =>
    React.createElement(
      "nav",
      { "aria-label": ariaLabel, "data-testid": "settings-nav" },
      React.createElement("button", { "data-testid": "nav-btn" }, "アカウント"),
    ),
}));

import SettingsModal from "../SettingsModal";

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

describe("SettingsModal – accessible dialog (#1851)", () => {
  it("renders with role=dialog and aria-modal=true when open", async () => {
    await act(async () => {
      root.render(<SettingsModal isOpen={true} onClose={() => {}} />);
    });

    const dialog = document.querySelector("[role='dialog']");
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
  });

  it("aria-labelledby points to the 設定 heading", async () => {
    await act(async () => {
      root.render(<SettingsModal isOpen={true} onClose={() => {}} />);
    });

    const dialog = document.querySelector("[role='dialog']");
    const labelledById = dialog?.getAttribute("aria-labelledby");
    expect(labelledById).toBeTruthy();

    const heading = document.getElementById(labelledById!);
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe("設定");
  });

  it("moves focus into the modal when opened", async () => {
    // Place a trigger button outside the modal
    const triggerBtn = document.createElement("button");
    triggerBtn.textContent = "設定を開く";
    document.body.appendChild(triggerBtn);
    triggerBtn.focus();
    expect(document.activeElement).toBe(triggerBtn);

    await act(async () => {
      root.render(<SettingsModal isOpen={true} onClose={() => {}} />);
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
      root.render(<SettingsModal isOpen={true} onClose={() => {}} />);
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
      root.render(<SettingsModal isOpen={true} onClose={() => {}} />);
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

  it("background sibling receives inert attribute while modal is open", async () => {
    // Render the modal first so the overlay element is created
    await act(async () => {
      root.render(<SettingsModal isOpen={true} onClose={() => {}} />);
    });

    // Find the overlay element and its parent to add a sibling there
    const overlay = document.querySelector<HTMLElement>("[data-settings-modal-overlay]");
    expect(overlay).not.toBeNull();

    const overlayParent = overlay!.parentElement!;
    const background = document.createElement("div");
    background.setAttribute("data-testid", "background");
    overlayParent.appendChild(background);

    // Re-render to trigger the effect with the new sibling
    await act(async () => {
      root.render(<SettingsModal isOpen={false} onClose={() => {}} />);
    });
    await act(async () => {
      root.render(<SettingsModal isOpen={true} onClose={() => {}} />);
    });

    // The background sibling of the overlay should be inert
    expect(background.hasAttribute("inert")).toBe(true);

    background.remove();
  });

  it("restores focus to originating element on close", async () => {
    const triggerBtn = document.createElement("button");
    triggerBtn.textContent = "設定を開く";
    document.body.appendChild(triggerBtn);
    triggerBtn.focus();

    const onClose = vi.fn();

    // Open
    await act(async () => {
      root.render(<SettingsModal isOpen={true} onClose={onClose} />);
    });

    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });

    // Close
    await act(async () => {
      root.render(<SettingsModal isOpen={false} onClose={onClose} />);
    });

    expect(document.activeElement).toBe(triggerBtn);
  });

  it("Escape key calls onClose", async () => {
    const onClose = vi.fn();

    await act(async () => {
      root.render(<SettingsModal isOpen={true} onClose={onClose} />);
    });

    fireKeyDown("Escape");

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders nothing when isOpen is false", async () => {
    await act(async () => {
      root.render(<SettingsModal isOpen={false} onClose={() => {}} />);
    });

    const dialog = document.querySelector("[role='dialog']");
    expect(dialog).toBeNull();
  });
});
