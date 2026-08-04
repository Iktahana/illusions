export type VerticalScrollBehavior = "auto" | "mouse" | "trackpad";

export interface VerticalWheelScrollInput {
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
  behavior: VerticalScrollBehavior;
  sensitivity: number;
}

export type VerticalWheelEvent = Pick<
  WheelEvent,
  "ctrlKey" | "deltaX" | "deltaY" | "preventDefault"
>;

/**
 * Convert a wheel gesture to the scrollLeft delta used by vertical-rl.
 *
 * Browser wheel deltas already reflect the operating system's natural-scroll
 * preference. Horizontal input therefore keeps deltaX's sign. Vertical input
 * is mapped onto the reversed vertical-rl reading axis, where decreasing
 * scrollLeft advances from the rightmost column toward the left.
 */
export function resolveVerticalWheelScrollDelta({
  deltaX,
  deltaY,
  ctrlKey,
  behavior,
  sensitivity,
}: VerticalWheelScrollInput): number | null {
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  if (absX === 0 && absY === 0) return null;

  const hasBothAxes = absX > 0 && absY > 0;
  const hasFineGrainedValues = (absY > 0 && absY < 50) || (absX > 0 && absX < 50);
  const isTrackpadInput =
    behavior === "trackpad" ||
    (behavior === "auto" && (hasBothAxes || (hasFineGrainedValues && !ctrlKey)));

  if (isTrackpadInput) {
    const primaryDelta = absX >= absY ? deltaX : -deltaY;
    return primaryDelta * sensitivity;
  }

  if (absY >= absX && absY > 0) {
    return -deltaY * sensitivity;
  }

  return deltaX * sensitivity;
}

/** Apply the resolved delta to the real vertical-writing scroll container. */
export function applyVerticalWheelScroll(
  container: Pick<HTMLElement, "scrollLeft">,
  event: VerticalWheelEvent,
  settings: Pick<VerticalWheelScrollInput, "behavior" | "sensitivity">,
): boolean {
  const scrollDelta = resolveVerticalWheelScrollDelta({
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    ctrlKey: event.ctrlKey,
    ...settings,
  });
  if (scrollDelta === null) return false;

  container.scrollLeft += scrollDelta;
  event.preventDefault();
  return true;
}
