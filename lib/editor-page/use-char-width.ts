"use client";

import type { RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";

const MEASURE_CHAR_COUNT = 40;
const MEASURE_TEXT = "国".repeat(MEASURE_CHAR_COUNT);

/**
 * Measures actual per-character width by rendering a hidden span with
 * {@link MEASURE_CHAR_COUNT} full-width characters that inherits the same CSS
 * (letter-spacing, font-feature-settings, etc.) as the editor text.
 *
 * Attach the returned `measureRef` to a `<span>` in the JSX that has the
 * correct editor CSS class and lives inside a container with the right
 * font-size / font-family / line-height.
 *
 * The hook re-measures on font setting changes and also watches for async
 * layout shifts (e.g. web font loading) via ResizeObserver.
 */
export function useCharWidth({
  fontFamily,
  fontScale,
  lineHeight,
  isVertical,
}: {
  fontFamily: string;
  fontScale: number;
  lineHeight: number;
  isVertical: boolean;
}): { measureRef: RefObject<HTMLSpanElement>; charWidth: number } {
  const measureRef = useRef<HTMLSpanElement>(null);
  const [charWidth, setCharWidth] = useState(0);

  // Synchronous measurement + ResizeObserver in a single effect.
  // useLayoutEffect guarantees the measurement runs before the browser paints,
  // so downstream effects always have an up-to-date charWidth on the first frame.
  // ResizeObserver catches async changes (e.g. web font swap after initial render).
  // Uses getBoundingClientRect() for sub-pixel precision — offsetWidth rounds to
  // integers, which can lose fractional pixels across 40 characters and cause the
  // last character to overflow.
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.getBoundingClientRect().width / MEASURE_CHAR_COUNT;
      if (w > 0) setCharWidth(w);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fontFamily, fontScale, lineHeight, isVertical]);

  return { measureRef, charWidth };
}

/** Text content for the hidden measurement span. */
export { MEASURE_TEXT };
