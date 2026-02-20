import type { ReactNode } from "react";

const formattingMarkers = ["**", "__", "~~", "*", "_", "`", "["];

/**
 * Renders a markdown-formatted heading title as React elements.
 * Supports bold, italic, strikethrough, code, and link syntax.
 */
export function renderFormattedTitle(title: string): ReactNode {
  let nodeCounter = 0;
  const nextKey = () => `formatted-${nodeCounter++}`;

  const findNextSpecial = (segment: string, start: number) => {
    let next = segment.length;

    formattingMarkers.forEach((marker) => {
      const pos = segment.indexOf(marker, start + 1);
      if (pos !== -1 && pos < next) {
        next = pos;
      }
    });

    return next;
  };

  const parseSegment = (segment: string): ReactNode[] => {
    const nodes: ReactNode[] = [];
    let idx = 0;

    while (idx < segment.length) {
      if (segment.startsWith("**", idx)) {
        const end = segment.indexOf("**", idx + 2);
        if (end > idx + 1) {
          nodes.push(
            <strong key={nextKey()} className="font-semibold text-foreground">
              {parseSegment(segment.slice(idx + 2, end))}
            </strong>
          );
          idx = end + 2;
          continue;
        }
      }

      if (segment.startsWith("__", idx)) {
        const end = segment.indexOf("__", idx + 2);
        if (end > idx + 1) {
          nodes.push(
            <strong key={nextKey()} className="font-semibold text-foreground">
              {parseSegment(segment.slice(idx + 2, end))}
            </strong>
          );
          idx = end + 2;
          continue;
        }
      }

      if (segment.startsWith("~~", idx)) {
        const end = segment.indexOf("~~", idx + 2);
        if (end > idx + 1) {
          nodes.push(
            <span key={nextKey()} className="text-foreground-tertiary line-through">
              {parseSegment(segment.slice(idx + 2, end))}
            </span>
          );
          idx = end + 2;
          continue;
        }
      }

      if (segment.startsWith("*", idx) && !segment.startsWith("**", idx)) {
        const end = segment.indexOf("*", idx + 1);
        if (end > idx) {
          nodes.push(
            <em key={nextKey()} className="italic text-foreground-secondary">
              {parseSegment(segment.slice(idx + 1, end))}
            </em>
          );
          idx = end + 1;
          continue;
        }
      }

      if (segment.startsWith("_", idx) && !segment.startsWith("__", idx)) {
        const end = segment.indexOf("_", idx + 1);
        if (end > idx) {
          nodes.push(
            <em key={nextKey()} className="italic text-foreground-secondary">
              {parseSegment(segment.slice(idx + 1, end))}
            </em>
          );
          idx = end + 1;
          continue;
        }
      }

      if (segment.startsWith("`", idx)) {
        const end = segment.indexOf("`", idx + 1);
        if (end > idx) {
          nodes.push(
            <code key={nextKey()} className="font-mono text-xs text-foreground-secondary bg-background-tertiary px-1 rounded-sm">
              {segment.slice(idx + 1, end)}
            </code>
          );
          idx = end + 1;
          continue;
        }
      }

      if (segment[idx] === "[") {
        const closeBracket = segment.indexOf("]", idx + 1);
        const openParen = closeBracket === -1 ? -1 : segment.indexOf("(", closeBracket + 1);
        const closeParen = openParen === -1 ? -1 : segment.indexOf(")", openParen + 1);

        if (closeBracket > idx && openParen === closeBracket + 1 && closeParen > openParen) {
          const label = segment.slice(idx + 1, closeBracket);
          nodes.push(
            <strong key={nextKey()} className="font-semibold text-foreground">
              {parseSegment(label)}
            </strong>
          );
          idx = closeParen + 1;
          continue;
        }
      }

      const nextSpecial = findNextSpecial(segment, idx);
      const plainText = segment.slice(idx, nextSpecial);
      if (plainText) {
        nodes.push(
          <span key={nextKey()}>{plainText}</span>
        );
      }
      idx = nextSpecial;
    }

    return nodes;
  };

  return <>{parseSegment(title)}</>;
}
