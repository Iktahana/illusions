// 位置計算の純関数。SearchDialog から抽出して unit-test 可能にする。
// dockview の transform が position:fixed の containing block を破壊するため、
// ダイアログは document.body 直下に portal される。本関数は anchor 要素の
// viewport 座標から、ダイアログを anchor の右上に置くための { top, right } を
// 算出し、viewport からはみ出ないように左右をクランプする。

export interface AnchorRect {
  readonly top: number;
  readonly right: number;
}

export interface AnchorPos {
  readonly top: number;
  readonly right: number;
}

/**
 * Compute the top-right anchor position for the dialog.
 *
 * @param rect anchor 要素の getBoundingClientRect() 由来の { top, right }
 * @param viewportWidth window.innerWidth
 * @param dialogWidth ダイアログ幅 (px)
 * @param padding ダイアログと viewport / anchor 右端の最小マージン (px)
 */
export function computeAnchorPos(
  rect: AnchorRect,
  viewportWidth: number,
  dialogWidth: number,
  padding: number,
): AnchorPos {
  const rawRight = viewportWidth - rect.right + padding;
  const minRight = padding;
  const maxRight = Math.max(padding, viewportWidth - dialogWidth - padding);
  const clampedRight = Math.max(minRight, Math.min(maxRight, rawRight));
  return { top: rect.top + padding / 2, right: clampedRight };
}
