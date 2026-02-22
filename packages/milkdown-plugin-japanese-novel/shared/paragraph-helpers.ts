/**
 * Shared paragraph processing utilities for ProseMirror decoration plugins.
 *
 * Used by both the linting plugin and the POS highlight plugin to avoid
 * code duplication (~160 lines of identical logic).
 */

import type { Node as ProseMirrorNode } from '@milkdown/prose/model';
import type { EditorView } from '@milkdown/prose/view';

/**
 * Atom node (e.g. ruby) position adjustment information.
 * Atom nodes occupy positions in ProseMirror but are not in textContent.
 */
export interface AtomAdjustment {
  textPos: number;       // Position in textContent (just before the atom)
  cumulativeOffset: number; // Cumulative additional offset
}

/**
 * Paragraph information
 */
export interface ParagraphInfo {
  node: ProseMirrorNode;
  pos: number;  // Paragraph start position
  text: string; // Text content of the paragraph
  atomAdjustments: AtomAdjustment[]; // Atom node position adjustments
  index: number; // Paragraph index (0-based)
}

/**
 * Get additional offset for converting textContent position to ProseMirror paragraph offset.
 */
export function getAtomOffset(adjustments: AtomAdjustment[], textPos: number): number {
  let offset = 0;
  for (const adj of adjustments) {
    if (adj.textPos <= textPos) {
      offset = adj.cumulativeOffset;
    } else {
      break;
    }
  }
  return offset;
}

/**
 * Collect paragraphs from the document.
 * Also computes atom node position adjustment information.
 */
export function collectParagraphs(doc: ProseMirrorNode): ParagraphInfo[] {
  const paragraphs: ParagraphInfo[] = [];
  let index = 0;

  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' && node.textContent) {
      const atomAdjustments: AtomAdjustment[] = [];
      let textPos = 0;
      let cumulativeOffset = 0;

      node.forEach((child) => {
        if (child.isText) {
          textPos += child.text!.length;
        } else {
          // Atom or other non-text inline node
          // Occupies nodeSize positions in ProseMirror but not in textContent
          cumulativeOffset += child.nodeSize;
          atomAdjustments.push({ textPos, cumulativeOffset });
        }
      });

      paragraphs.push({
        node,
        pos,
        text: node.textContent,
        atomAdjustments,
        index: index++,
      });
      return false; // Do not descend into children
    }
    return true;
  });

  return paragraphs;
}

/**
 * Find the actual scroll container of the editor.
 * Traverses parents from the ProseMirror DOM to find an element with overflow: auto/scroll.
 */
export function findScrollContainer(el: HTMLElement): HTMLElement {
  let parent = el.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    if (style.overflowX === 'auto' || style.overflowX === 'scroll' ||
        style.overflowY === 'auto' || style.overflowY === 'scroll') {
      return parent;
    }
    parent = parent.parentElement;
  }
  return el;
}

/**
 * Get paragraphs visible in the viewport (including buffer paragraphs before/after).
 * Uses coordsAtPos which works correctly for both horizontal and vertical writing.
 */
export function getVisibleParagraphs(
  view: EditorView,
  allParagraphs: ParagraphInfo[],
  buffer: number = 2
): ParagraphInfo[] {
  if (allParagraphs.length === 0) return [];

  const scrollContainer = findScrollContainer(view.dom);
  const containerRect = scrollContainer.getBoundingClientRect();
  const visibleIndices = new Set<number>();

  for (const paragraph of allParagraphs) {
    try {
      // +1 to get coordinates inside the paragraph node
      const coords = view.coordsAtPos(paragraph.pos + 1);
      if (coords) {
        // coordsAtPos returns viewport coordinates
        // Check intersection with the container's visible area
        if (coords.top < containerRect.bottom && coords.bottom > containerRect.top &&
            coords.left < containerRect.right && coords.right > containerRect.left) {
          visibleIndices.add(paragraph.index);
        }
      }
    } catch {
      // Skip if coordsAtPos throws an error
    }
  }

  // Also include the paragraph at cursor position
  const { from } = view.state.selection;
  for (const paragraph of allParagraphs) {
    if (from >= paragraph.pos && from <= paragraph.pos + paragraph.node.nodeSize) {
      visibleIndices.add(paragraph.index);
      break;
    }
  }

  // Fallback: if no visible paragraphs found, use first 5
  if (visibleIndices.size === 0) {
    for (let i = 0; i < Math.min(5, allParagraphs.length); i++) {
      visibleIndices.add(i);
    }
  }

  // Expand with buffer
  const expandedIndices = new Set<number>();
  for (const index of visibleIndices) {
    for (let i = Math.max(0, index - buffer); i <= Math.min(allParagraphs.length - 1, index + buffer); i++) {
      expandedIndices.add(i);
    }
  }

  return allParagraphs.filter(p => expandedIndices.has(p.index));
}
