/**
 * Auto-scroll for speech reading
 *
 * Smoothly scrolls the editor to keep the reading highlight visible,
 * with a page-turn-like easing animation. Works in both horizontal
 * and vertical (vertical-rl) writing modes.
 */

/** Easing: ease-out cubic for a natural deceleration feel */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

let activeAnimationId: number | null = null;

/** Clear the programmatic scroll flag (used when no scroll animation is needed). */
function clearProgrammaticFlag(ref?: { current: boolean | null } | null): void {
  if (ref) {
    ref.current = false;
  }
}

/**
 * Cancel any in-progress scroll animation.
 */
export function cancelSpeechScroll(): void {
  if (activeAnimationId != null) {
    cancelAnimationFrame(activeAnimationId);
    activeAnimationId = null;
  }
}

interface SpeechScrollOptions {
  container: HTMLElement;
  target: HTMLElement;
  isVertical: boolean;
  /** Ref to signal programmatic scrolling to the scroll-guard in Editor.tsx */
  programmaticScrollRef?: React.RefObject<boolean>;
  /** Duration in ms (default 400) */
  duration?: number;
  /** How far from the edge (0-1) the target must be before triggering a scroll.
   *  Default 0.25 — scroll when the target enters the outer 25% of the viewport. */
  edgeThreshold?: number;
}

/**
 * Scroll the container so that `target` is comfortably visible.
 *
 * - Only scrolls when the target is near the edge or outside the viewport.
 * - Scrolls to place the target at ~30% from the leading edge (reading direction),
 *   giving the reader a comfortable look-ahead.
 * - Uses a smooth ease-out animation for a page-turn feel.
 */
export function scrollToSpeechTarget({
  container,
  target,
  isVertical,
  programmaticScrollRef,
  duration = 400,
  edgeThreshold = 0.25,
}: SpeechScrollOptions): void {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();

  if (isVertical) {
    // Vertical writing mode (vertical-rl): text flows right-to-left.
    // The "leading edge" is the right side of the container.
    const viewportWidth = containerRect.width;
    const targetCenterX = targetRect.left + targetRect.width / 2 - containerRect.left;

    // Check if the target is within the comfortable zone
    const rightThreshold = viewportWidth * (1 - edgeThreshold);
    const leftThreshold = viewportWidth * edgeThreshold;

    if (targetCenterX > leftThreshold && targetCenterX < rightThreshold) {
      // Target is in the comfortable zone — no scroll needed
      clearProgrammaticFlag(programmaticScrollRef);
      return;
    }

    // Place target at 30% from the right edge (reading direction start)
    const desiredX = viewportWidth * 0.7;
    const scrollDelta = targetCenterX - desiredX;

    animateScroll(container, "scrollLeft", container.scrollLeft + scrollDelta, duration, programmaticScrollRef);
  } else {
    // Horizontal writing mode: text flows top-to-bottom.
    const viewportHeight = containerRect.height;
    const targetCenterY = targetRect.top + targetRect.height / 2 - containerRect.top;

    const topThreshold = viewportHeight * edgeThreshold;
    const bottomThreshold = viewportHeight * (1 - edgeThreshold);

    if (targetCenterY > topThreshold && targetCenterY < bottomThreshold) {
      clearProgrammaticFlag(programmaticScrollRef);
      return;
    }

    // Place target at 30% from the top
    const desiredY = viewportHeight * 0.3;
    const scrollDelta = targetCenterY - desiredY;

    animateScroll(container, "scrollTop", container.scrollTop + scrollDelta, duration, programmaticScrollRef);
  }
}

function animateScroll(
  container: HTMLElement,
  prop: "scrollLeft" | "scrollTop",
  targetValue: number,
  duration: number,
  programmaticScrollRef?: React.RefObject<boolean>,
): void {
  cancelSpeechScroll();

  const start = container[prop];
  const delta = targetValue - start;
  if (Math.abs(delta) < 1) {
    clearProgrammaticFlag(programmaticScrollRef);
    return;
  }

  // Signal to the scroll guard that this is a programmatic scroll
  if (programmaticScrollRef) {
    (programmaticScrollRef as { current: boolean }).current = true;
  }

  const startTime = performance.now();

  function step(now: number): void {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutCubic(progress);

    container[prop] = start + delta * easedProgress;

    if (progress < 1) {
      activeAnimationId = requestAnimationFrame(step);
    } else {
      activeAnimationId = null;
      // Clear the programmatic scroll flag after animation completes
      if (programmaticScrollRef) {
        (programmaticScrollRef as { current: boolean }).current = false;
      }
    }
  }

  activeAnimationId = requestAnimationFrame(step);
}
