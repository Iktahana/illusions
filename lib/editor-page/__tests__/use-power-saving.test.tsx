/**
 * Tests for usePowerSaving (#1402 follow-up).
 *
 * The previous implementation FORCED power-save ON whenever it saw "battery",
 * and re-ran on every effect re-subscription — which made power-save
 * impossible to turn off on battery. The new design:
 *
 * 1. SUGGESTS power-save on AC→battery (never forces),
 * 2. auto-disables power-save on battery→AC,
 * 3. only reacts to genuine state TRANSITIONS (repeated same-state is a no-op),
 * 4. never suggests when already in power-save or when the setting is off.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { usePowerSaving } from "../use-power-saving";

type PowerState = "ac" | "battery";

// ---------------------------------------------------------------------------
// Fake Electron power API
// ---------------------------------------------------------------------------

let initialState: PowerState = "ac";
let stateListener: ((state: PowerState) => void) | null = null;
let resolveInitial: () => void;
let initialApplied: Promise<void>;

function installPowerApi(): void {
  initialApplied = new Promise<void>((resolve) => {
    resolveInitial = resolve;
  });
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    power: {
      getPowerState: () =>
        Promise.resolve(initialState).then((s) => {
          // Let tests await the mount-time application.
          queueMicrotask(resolveInitial);
          return s;
        }),
      onPowerStateChange: (cb: (state: PowerState) => void) => {
        stateListener = cb;
        return () => {
          stateListener = null;
        };
      },
    },
  };
}

function emit(state: PowerState): Promise<void> {
  return act(async () => {
    stateListener?.(state);
  });
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

interface HostProps {
  powerSaveMode: boolean;
  autoPowerSaveOnBattery: boolean;
  onPowerSaveModeChange: (enabled: boolean) => void;
  onSuggestPowerSave: () => void;
}

function HookHost(props: HostProps): null {
  usePowerSaving(props);
  return null;
}

let root: Root;
let container: HTMLDivElement;

async function mountHook(props: HostProps): Promise<void> {
  await act(async () => {
    root.render(<HookHost {...props} />);
  });
  await act(async () => {
    await initialApplied;
  });
}

beforeEach(() => {
  initialState = "ac";
  stateListener = null;
  installPowerApi();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});

function makeProps(overrides: Partial<HostProps> = {}): HostProps {
  return {
    powerSaveMode: false,
    autoPowerSaveOnBattery: true,
    onPowerSaveModeChange: vi.fn(),
    onSuggestPowerSave: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("usePowerSaving", () => {
  it("suggests (never forces) power-save when switching to battery", async () => {
    const props = makeProps();
    await mountHook(props); // mounts on AC
    await emit("battery");

    expect(props.onSuggestPowerSave).toHaveBeenCalledTimes(1);
    // Crucially, it never FORCES power-save on.
    expect(props.onPowerSaveModeChange).not.toHaveBeenCalledWith(true);
  });

  it("auto-disables power-save when AC is restored", async () => {
    const props = makeProps({ powerSaveMode: true });
    initialState = "battery";
    await mountHook(props); // mounts on battery (suggestion skipped: already on)
    await emit("ac");

    expect(props.onPowerSaveModeChange).toHaveBeenCalledWith(false);
    // Mounting on battery while already in power-save must not force or suggest.
    expect(props.onSuggestPowerSave).not.toHaveBeenCalled();
  });

  it("does not re-suggest on repeated battery readings (no transition)", async () => {
    const props = makeProps();
    await mountHook(props); // AC
    await emit("battery");
    await emit("battery");
    await emit("battery");

    expect(props.onSuggestPowerSave).toHaveBeenCalledTimes(1);
  });

  it("does not suggest while power-save is already enabled", async () => {
    const props = makeProps({ powerSaveMode: true });
    await mountHook(props); // AC
    await emit("battery");

    expect(props.onSuggestPowerSave).not.toHaveBeenCalled();
  });

  it("does not suggest when the auto-suggest setting is off", async () => {
    const props = makeProps({ autoPowerSaveOnBattery: false });
    await mountHook(props); // AC
    await emit("battery");

    expect(props.onSuggestPowerSave).not.toHaveBeenCalled();
  });

  it("suggests on mount when already on battery", async () => {
    const props = makeProps();
    initialState = "battery";
    await mountHook(props);

    expect(props.onSuggestPowerSave).toHaveBeenCalledTimes(1);
  });

  it("does NOT auto-disable on the initial AC reading (mount must not race the restore path)", async () => {
    const props = makeProps({ powerSaveMode: true });
    initialState = "ac";
    await mountHook(props);

    // The initial reading only records state; auto-disable is reserved for a
    // real battery→AC transition so it can't clear prePowerSaveState at boot.
    expect(props.onPowerSaveModeChange).not.toHaveBeenCalled();
  });

  it("throttles repeated suggestions across rapid AC/battery bounce", async () => {
    const props = makeProps();
    await mountHook(props); // AC
    await emit("battery"); // suggestion #1
    await emit("ac");
    await emit("battery"); // within the throttle window → suppressed

    expect(props.onSuggestPowerSave).toHaveBeenCalledTimes(1);
  });
});
