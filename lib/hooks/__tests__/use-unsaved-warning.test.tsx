/**
 * Regression tests for the unsaved-warning save gate (#1859).
 *
 * Root cause: handleSave ran the pending action (project switch) after the
 * save resolved, regardless of whether the save actually succeeded — so a
 * cancelled/failed save still proceeded and lost unsaved content.
 *
 * The fix: the save callback now returns an aggregate { allSaved } and
 * handleSave only runs the pending action (and closes the dialog) when
 * allSaved !== false.
 *
 * Drives the REAL hook (createRoot + act, repo pattern).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { useUnsavedWarning } from "../use-unsaved-warning";
import type { UseUnsavedWarningReturn, UnsavedSaveResult } from "../use-unsaved-warning";

let api: UseUnsavedWarningReturn | null = null;

function HookHost({
  isDirty,
  saveFile,
}: {
  isDirty: boolean;
  saveFile: () => Promise<UnsavedSaveResult | void>;
}): null {
  const value = useUnsavedWarning(isDirty, saveFile, "test.mdi");
  useEffect(() => {
    api = value;
  });
  return null;
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  api = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

async function mount(
  isDirty: boolean,
  saveFile: () => Promise<UnsavedSaveResult | void>,
): Promise<void> {
  await act(async () => {
    root.render(<HookHost isDirty={isDirty} saveFile={saveFile} />);
  });
}

describe("#1859 useUnsavedWarning save gate", () => {
  it("runs the pending action and closes the dialog when allSaved=true", async () => {
    const saveFile = vi.fn(async () => ({ allSaved: true }));
    const pending = vi.fn();
    await mount(true, saveFile);

    await act(async () => {
      await api!.confirmBeforeAction(pending);
    });
    expect(api!.showWarning).toBe(true);

    await act(async () => {
      await api!.handleSave();
    });

    expect(saveFile).toHaveBeenCalledTimes(1);
    expect(pending).toHaveBeenCalledTimes(1);
    expect(api!.showWarning).toBe(false);
  });

  it("BLOCKS the pending action and keeps the dialog open when allSaved=false", async () => {
    const saveFile = vi.fn(async () => ({ allSaved: false }));
    const pending = vi.fn();
    await mount(true, saveFile);

    await act(async () => {
      await api!.confirmBeforeAction(pending);
    });

    await act(async () => {
      await api!.handleSave();
    });

    expect(saveFile).toHaveBeenCalledTimes(1);
    // Data-loss guard: project switch must NOT run on a cancelled/failed save.
    expect(pending).not.toHaveBeenCalled();
    // Dialog stays open so the user can retry or cancel.
    expect(api!.showWarning).toBe(true);
  });

  it("treats a void result as success (backward compatibility)", async () => {
    const saveFile = vi.fn(async () => undefined);
    const pending = vi.fn();
    await mount(true, saveFile);

    await act(async () => {
      await api!.confirmBeforeAction(pending);
    });
    await act(async () => {
      await api!.handleSave();
    });

    expect(pending).toHaveBeenCalledTimes(1);
    expect(api!.showWarning).toBe(false);
  });
});
