"use client";

/**
 * Vertical text clipped to an exact N-character box can paint flush against the
 * bottom edge on compact viewports because glyph metrics and line-height are not
 * identical to the measured advance. Keep one character of slack in the layout
 * constraint while preserving the user's configured value.
 */
export function getLayoutCharsPerLine(charsPerLine: number, isVertical: boolean): number {
  if (!isVertical) return charsPerLine;
  return Math.max(1, charsPerLine - 1);
}
