// lib/tab-manager/terminal-label.ts
/**
 * Mutable counter abstraction compatible with React's MutableRefObject<number>.
 * Defined here to keep this module test-friendly without importing React.
 */
export interface TerminalLabelCounter {
  current: number;
}

/**
 * Allocate the next sequential terminal tab label (`ターミナル 1`, `ターミナル 2`, …).
 *
 * Side effect: increments `counter.current` by 1.
 * Used by `useTabState.newTerminalTab`. Extracted as a pure helper so that the
 * numbering contract can be regression-tested without `@testing-library/react`.
 *
 * Regression target: PR #1425 / issue #1473
 */
export function nextTerminalLabel(counter: TerminalLabelCounter): string {
  counter.current += 1;
  return `ターミナル ${counter.current}`;
}
