let activeAnimationId: number | null = null;

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

export function cancelSpeechScroll(): void {
  if (activeAnimationId === null) return;
  cancelAnimationFrame(activeAnimationId);
  activeAnimationId = null;
}

interface SpeechScrollOptions {
  container: HTMLElement;
  target: HTMLElement;
  isVertical: boolean;
  duration?: number;
  edgeThreshold?: number;
}

/** Keep the spoken range inside the comfortable reading area of its pane. */
export function scrollToSpeechTarget({
  container,
  target,
  isVertical,
  duration = 400,
  edgeThreshold = 0.25,
}: SpeechScrollOptions): void {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();

  if (isVertical) {
    const center = targetRect.left + targetRect.width / 2 - containerRect.left;
    const leading = containerRect.width * edgeThreshold;
    const trailing = containerRect.width * (1 - edgeThreshold);
    if (center > leading && center < trailing) return;
    animateScroll(
      container,
      "scrollLeft",
      container.scrollLeft + center - containerRect.width * 0.7,
      duration,
    );
    return;
  }

  const center = targetRect.top + targetRect.height / 2 - containerRect.top;
  const leading = containerRect.height * edgeThreshold;
  const trailing = containerRect.height * (1 - edgeThreshold);
  if (center > leading && center < trailing) return;
  animateScroll(
    container,
    "scrollTop",
    container.scrollTop + center - containerRect.height * 0.3,
    duration,
  );
}

function animateScroll(
  container: HTMLElement,
  property: "scrollLeft" | "scrollTop",
  target: number,
  duration: number,
): void {
  cancelSpeechScroll();
  const start = container[property];
  const delta = target - start;
  if (Math.abs(delta) < 1) return;
  const startedAt = performance.now();

  const step = (now: number): void => {
    const progress = Math.min((now - startedAt) / duration, 1);
    container[property] = start + delta * easeOutCubic(progress);
    if (progress < 1) activeAnimationId = requestAnimationFrame(step);
    else activeAnimationId = null;
  };
  activeAnimationId = requestAnimationFrame(step);
}
