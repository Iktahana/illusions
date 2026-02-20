/**
 * Scroll progress abstraction layer
 *
 * Unified handling of scroll progress for horizontal/vertical writing modes,
 * providing a 0-1 progress value:
 * - 0% = beginning of document
 * - 100% = end of document
 *
 * Internal handling:
 * - Horizontal writing mode (horizontal-tb): uses scrollTop, 0=beginning, max=end
 * - Vertical writing mode (vertical-rl): uses scrollLeft, max=beginning, 0=end
 */

export interface ScrollProgressOptions {
  container: HTMLElement;
  isVertical: boolean;
}

/**
 * Get current reading progress (0-1)
 *
 * @param options.container - Scroll container element
 * @param options.isVertical - Whether in vertical writing mode
 * @returns Progress value 0-1, 0=beginning, 1=end
 *
 * @example
 * const progress = getScrollProgress({ container, isVertical: true });
 * // In vertical mode, scrollLeft=maxScroll returns 0, scrollLeft=0 returns 1
 */
export function getScrollProgress({ container, isVertical }: ScrollProgressOptions): number {
  if (isVertical) {
    // Vertical writing mode: uses scrollLeft (horizontal scrollbar)
    // scrollLeft = maxScroll is the beginning (0%)
    // scrollLeft = 0 is the end (100%)
    const maxScroll = container.scrollWidth - container.clientWidth;
    if (maxScroll <= 0) return 0;
    
    const progress = 1 - (container.scrollLeft / maxScroll);
    
    // console.debug('[ScrollProgress] Get (vertical):', {
    //   scrollLeft: container.scrollLeft,
    //   maxScroll,
    //   progress,
    //   scrollWidth: container.scrollWidth,
    //   clientWidth: container.clientWidth
    // });
    
    return progress;
  } else {
    // Horizontal writing mode: uses scrollTop (vertical scrollbar)
    // scrollTop = 0 is the beginning (0%)
    // scrollTop = maxScroll is the end (100%)
    const maxScroll = container.scrollHeight - container.clientHeight;
    if (maxScroll <= 0) return 0;
    
    const progress = container.scrollTop / maxScroll;
    
    // console.debug('[ScrollProgress] Get (horizontal):', {
    //   scrollTop: container.scrollTop,
    //   maxScroll,
    //   progress,
    //   scrollHeight: container.scrollHeight,
    //   clientHeight: container.clientHeight
    // });
    
    return progress;
  }
}

/**
 * Set reading progress (0-1)
 *
 * @param options.container - Scroll container element
 * @param options.isVertical - Whether in vertical writing mode
 * @param progress - Target progress value 0-1, 0=beginning, 1=end
 * @returns Whether the progress was set successfully (returns false if no scrollbar)
 *
 * @example
 * setScrollProgress({ container, isVertical: true }, 0.5);
 * // In vertical mode, sets to the 50% position
 */
export function setScrollProgress(
  { container, isVertical }: ScrollProgressOptions,
  progress: number
): boolean {
  // Clamp progress value to the 0-1 range
  const clampedProgress = Math.max(0, Math.min(1, progress));
  
  if (isVertical) {
    // Vertical writing mode: uses scrollLeft
    // progress = 0% -> scrollLeft = maxScroll (beginning/right)
    // progress = 100% -> scrollLeft = 0 (end/left)
    const maxScroll = container.scrollWidth - container.clientWidth;
    if (maxScroll <= 0) return false;
    
    const newScrollLeft = (1 - clampedProgress) * maxScroll;
    
    // console.debug('[ScrollProgress] Set (vertical):', {
    //   progress: clampedProgress,
    //   maxScroll,
    //   newScrollLeft,
    //   beforeScrollLeft: container.scrollLeft,
    //   scrollWidth: container.scrollWidth,
    //   clientWidth: container.clientWidth
    // });
    
    container.scrollLeft = newScrollLeft;
    
    // console.debug('[ScrollProgress] After set (vertical):', {
    //   scrollLeft: container.scrollLeft,
    //   actualProgress: 1 - (container.scrollLeft / maxScroll)
    // });
    
    return true;
  } else {
    // Horizontal writing mode: uses scrollTop
    // progress = 0% -> scrollTop = 0 (beginning/top)
    // progress = 100% -> scrollTop = maxScroll (end/bottom)
    const maxScroll = container.scrollHeight - container.clientHeight;
    if (maxScroll <= 0) return false;
    
    const newScrollTop = clampedProgress * maxScroll;
    
    // console.debug('[ScrollProgress] Set (horizontal):', {
    //   progress: clampedProgress,
    //   maxScroll,
    //   newScrollTop,
    //   beforeScrollTop: container.scrollTop,
    //   scrollHeight: container.scrollHeight,
    //   clientHeight: container.clientHeight
    // });
    
    container.scrollTop = newScrollTop;
    
    // console.debug('[ScrollProgress] After set (horizontal):', {
    //   scrollTop: container.scrollTop,
    //   actualProgress: container.scrollTop / maxScroll
    // });
    
    return true;
  }
}

/**
 * Calculate mirrored progress
 * Used to maintain visual position during mode switch
 *
 * @param progress - Original progress 0-1
 * @returns Mirrored progress (1 - progress)
 *
 * @example
 * getMirroredProgress(0.3) // returns 0.7
 */
export function getMirroredProgress(progress: number): number {
  return 1 - progress;
}

/**
 * Get maximum scroll value
 *
 * @param options.container - Scroll container element
 * @param options.isVertical - Whether in vertical writing mode
 * @returns Maximum scroll value (in pixels)
 */
export function getMaxScroll({ container, isVertical }: ScrollProgressOptions): number {
  if (isVertical) {
    return container.scrollWidth - container.clientWidth;
  } else {
    return container.scrollHeight - container.clientHeight;
  }
}

/**
 * Check if a scrollbar exists
 *
 * @param options.container - Scroll container element
 * @param options.isVertical - Whether in vertical writing mode
 * @returns Whether a scrollbar exists
 */
export function hasScrollbar({ container, isVertical }: ScrollProgressOptions): boolean {
  return getMaxScroll({ container, isVertical }) > 0;
}

/**
 * Jump to the beginning of the document (0%)
 *
 * @param options.container - Scroll container element
 * @param options.isVertical - Whether in vertical writing mode
 * @returns Whether the operation succeeded
 */
export function scrollToStart({ container, isVertical }: ScrollProgressOptions): boolean {
  // console.debug('[ScrollProgress] Scroll to start');
  return setScrollProgress({ container, isVertical }, 0);
}

/**
 * Jump to the end of the document (100%)
 *
 * @param options.container - Scroll container element
 * @param options.isVertical - Whether in vertical writing mode
 * @returns Whether the operation succeeded
 */
export function scrollToEnd({ container, isVertical }: ScrollProgressOptions): boolean {
  // console.debug('[ScrollProgress] Scroll to end');
  return setScrollProgress({ container, isVertical }, 1);
}

/**
 * Scroll by percentage
 *
 * @param options.container - Scroll container element
 * @param options.isVertical - Whether in vertical writing mode
 * @param delta - Percentage increment to scroll; positive scrolls toward end, negative toward beginning
 * @returns Whether the operation succeeded
 *
 * @example
 * scrollByPercent({ container, isVertical }, 0.1);  // scroll 10% toward end
 * scrollByPercent({ container, isVertical }, -0.05); // scroll 5% toward beginning
 */
export function scrollByPercent(
  { container, isVertical }: ScrollProgressOptions,
  delta: number
): boolean {
  const currentProgress = getScrollProgress({ container, isVertical });
  const newProgress = currentProgress + delta;
  
  // console.debug('[ScrollProgress] Scroll by percent:', {
  //   currentProgress,
  //   delta,
  //   newProgress
  // });
  
  return setScrollProgress({ container, isVertical }, newProgress);
}
