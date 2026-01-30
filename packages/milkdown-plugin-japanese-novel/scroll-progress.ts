/**
 * 滾動進度抽象層
 * 
 * 統一處理橫排/豎排的滾動進度，提供 0-1 的進度值：
 * - 0% = 文章開頭
 * - 100% = 文章末尾
 * 
 * 內部處理：
 * - 橫排 (horizontal-tb): 使用 scrollTop，0=開頭，max=末尾
 * - 豎排 (vertical-rl): 使用 scrollLeft，max=開頭，0=末尾
 */

export interface ScrollProgressOptions {
  container: HTMLElement;
  isVertical: boolean;
}

/**
 * 獲取當前閱讀進度 (0-1)
 * 
 * @param options.container - 滾動容器元素
 * @param options.isVertical - 是否為豎排模式
 * @returns 進度值 0-1，0=開頭，1=末尾
 * 
 * @example
 * const progress = getScrollProgress({ container, isVertical: true });
 * // 豎排模式下，scrollLeft=maxScroll 返回 0，scrollLeft=0 返回 1
 */
export function getScrollProgress({ container, isVertical }: ScrollProgressOptions): number {
  if (isVertical) {
    // 豎排：使用 scrollLeft（橫向滾動條）
    // scrollLeft = maxScroll 是開頭 (0%)
    // scrollLeft = 0 是末尾 (100%)
    const maxScroll = container.scrollWidth - container.clientWidth;
    if (maxScroll <= 0) return 0;
    
    const progress = 1 - (container.scrollLeft / maxScroll);
    
    console.debug('[ScrollProgress] Get (vertical):', {
      scrollLeft: container.scrollLeft,
      maxScroll,
      progress,
      scrollWidth: container.scrollWidth,
      clientWidth: container.clientWidth
    });
    
    return progress;
  } else {
    // 橫排：使用 scrollTop（豎向滾動條）
    // scrollTop = 0 是開頭 (0%)
    // scrollTop = maxScroll 是末尾 (100%)
    const maxScroll = container.scrollHeight - container.clientHeight;
    if (maxScroll <= 0) return 0;
    
    const progress = container.scrollTop / maxScroll;
    
    console.debug('[ScrollProgress] Get (horizontal):', {
      scrollTop: container.scrollTop,
      maxScroll,
      progress,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight
    });
    
    return progress;
  }
}

/**
 * 設置閱讀進度 (0-1)
 * 
 * @param options.container - 滾動容器元素
 * @param options.isVertical - 是否為豎排模式
 * @param progress - 目標進度值 0-1，0=開頭，1=末尾
 * @returns 是否成功設置（如果沒有滾動條則返回 false）
 * 
 * @example
 * setScrollProgress({ container, isVertical: true }, 0.5);
 * // 豎排模式下，設置到 50% 位置
 */
export function setScrollProgress(
  { container, isVertical }: ScrollProgressOptions,
  progress: number
): boolean {
  // 確保進度值在 0-1 範圍內
  const clampedProgress = Math.max(0, Math.min(1, progress));
  
  if (isVertical) {
    // 豎排：使用 scrollLeft
    // progress = 0% → scrollLeft = maxScroll (開頭/右邊)
    // progress = 100% → scrollLeft = 0 (末尾/左邊)
    const maxScroll = container.scrollWidth - container.clientWidth;
    if (maxScroll <= 0) return false;
    
    const newScrollLeft = (1 - clampedProgress) * maxScroll;
    
    console.debug('[ScrollProgress] Set (vertical):', {
      progress: clampedProgress,
      maxScroll,
      newScrollLeft,
      beforeScrollLeft: container.scrollLeft,
      scrollWidth: container.scrollWidth,
      clientWidth: container.clientWidth
    });
    
    container.scrollLeft = newScrollLeft;
    
    console.debug('[ScrollProgress] After set (vertical):', {
      scrollLeft: container.scrollLeft,
      actualProgress: 1 - (container.scrollLeft / maxScroll)
    });
    
    return true;
  } else {
    // 橫排：使用 scrollTop
    // progress = 0% → scrollTop = 0 (開頭/頂部)
    // progress = 100% → scrollTop = maxScroll (末尾/底部)
    const maxScroll = container.scrollHeight - container.clientHeight;
    if (maxScroll <= 0) return false;
    
    const newScrollTop = clampedProgress * maxScroll;
    
    console.debug('[ScrollProgress] Set (horizontal):', {
      progress: clampedProgress,
      maxScroll,
      newScrollTop,
      beforeScrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight
    });
    
    container.scrollTop = newScrollTop;
    
    console.debug('[ScrollProgress] After set (horizontal):', {
      scrollTop: container.scrollTop,
      actualProgress: container.scrollTop / maxScroll
    });
    
    return true;
  }
}

/**
 * 計算鏡像進度
 * 用於模式切換時保持視覺位置
 * 
 * @param progress - 原始進度 0-1
 * @returns 鏡像進度 (1 - progress)
 * 
 * @example
 * getMirroredProgress(0.3) // 返回 0.7
 */
export function getMirroredProgress(progress: number): number {
  return 1 - progress;
}

/**
 * 獲取最大滾動值
 * 
 * @param options.container - 滾動容器元素
 * @param options.isVertical - 是否為豎排模式
 * @returns 最大滾動值（像素）
 */
export function getMaxScroll({ container, isVertical }: ScrollProgressOptions): number {
  if (isVertical) {
    return container.scrollWidth - container.clientWidth;
  } else {
    return container.scrollHeight - container.clientHeight;
  }
}

/**
 * 檢查是否有滾動條
 * 
 * @param options.container - 滾動容器元素
 * @param options.isVertical - 是否為豎排模式
 * @returns 是否有滾動條
 */
export function hasScrollbar({ container, isVertical }: ScrollProgressOptions): boolean {
  return getMaxScroll({ container, isVertical }) > 0;
}

/**
 * 跳到文章開頭 (0%)
 * 
 * @param options.container - 滾動容器元素
 * @param options.isVertical - 是否為豎排模式
 * @returns 是否成功
 */
export function scrollToStart({ container, isVertical }: ScrollProgressOptions): boolean {
  console.debug('[ScrollProgress] Scroll to start');
  return setScrollProgress({ container, isVertical }, 0);
}

/**
 * 跳到文章末尾 (100%)
 * 
 * @param options.container - 滾動容器元素
 * @param options.isVertical - 是否為豎排模式
 * @returns 是否成功
 */
export function scrollToEnd({ container, isVertical }: ScrollProgressOptions): boolean {
  console.debug('[ScrollProgress] Scroll to end');
  return setScrollProgress({ container, isVertical }, 1);
}

/**
 * 按百分比滾動
 * 
 * @param options.container - 滾動容器元素
 * @param options.isVertical - 是否為豎排模式
 * @param delta - 滾動的百分比增量，正數向末尾滾動，負數向開頭滾動
 * @returns 是否成功
 * 
 * @example
 * scrollByPercent({ container, isVertical }, 0.1);  // 向末尾滾動 10%
 * scrollByPercent({ container, isVertical }, -0.05); // 向開頭滾動 5%
 */
export function scrollByPercent(
  { container, isVertical }: ScrollProgressOptions,
  delta: number
): boolean {
  const currentProgress = getScrollProgress({ container, isVertical });
  const newProgress = currentProgress + delta;
  
  console.debug('[ScrollProgress] Scroll by percent:', {
    currentProgress,
    delta,
    newProgress
  });
  
  return setScrollProgress({ container, isVertical }, newProgress);
}
