import { describe, expect, it } from "vitest";

import { resolveVerticalWheelScrollDelta } from "../vertical-wheel-scroll";

const trackpad = {
  deltaY: 0,
  ctrlKey: false,
  behavior: "trackpad" as const,
  sensitivity: 1,
};

describe("resolveVerticalWheelScrollDelta", () => {
  it.each([
    [24, 24],
    [-24, -24],
  ])("preserves the OS-adjusted horizontal trackpad sign (%s → %s)", (deltaX, expected) => {
    expect(resolveVerticalWheelScrollDelta({ ...trackpad, deltaX })).toBe(expected);
  });

  it.each([
    [24, -24],
    [-24, 24],
  ])(
    "maps both vertical trackpad directions onto the vertical-rl reading axis (%s → %s)",
    (deltaY, expected) => {
      expect(
        resolveVerticalWheelScrollDelta({
          ...trackpad,
          deltaX: 0,
          deltaY,
        }),
      ).toBe(expected);
    },
  );

  it("uses only the dominant axis for diagonal and inertial trackpad input", () => {
    expect(
      resolveVerticalWheelScrollDelta({
        ...trackpad,
        deltaX: -3,
        deltaY: 11,
        sensitivity: 1.5,
      }),
    ).toBe(-16.5);
    expect(
      resolveVerticalWheelScrollDelta({
        ...trackpad,
        deltaX: -12,
        deltaY: 4,
        sensitivity: 1.5,
      }),
    ).toBe(-18);
  });

  it("keeps mouse-wheel vertical mapping and Shift-generated horizontal signs consistent", () => {
    expect(
      resolveVerticalWheelScrollDelta({
        deltaX: 0,
        deltaY: 100,
        ctrlKey: false,
        behavior: "mouse",
        sensitivity: 0.5,
      }),
    ).toBe(-50);
    expect(
      resolveVerticalWheelScrollDelta({
        deltaX: 100,
        deltaY: 0,
        ctrlKey: false,
        behavior: "mouse",
        sensitivity: 0.5,
      }),
    ).toBe(50);
  });

  it("auto-detects fine and dual-axis trackpad input without changing its direction", () => {
    expect(
      resolveVerticalWheelScrollDelta({
        deltaX: -8,
        deltaY: 2,
        ctrlKey: false,
        behavior: "auto",
        sensitivity: 2,
      }),
    ).toBe(-16);
    expect(
      resolveVerticalWheelScrollDelta({
        deltaX: 0,
        deltaY: -6,
        ctrlKey: false,
        behavior: "auto",
        sensitivity: 2,
      }),
    ).toBe(12);
  });

  it("ignores an empty wheel event", () => {
    expect(
      resolveVerticalWheelScrollDelta({
        ...trackpad,
        deltaX: 0,
      }),
    ).toBeNull();
  });
});
