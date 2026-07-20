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

/** ドラッグ後の絶対座標 (left/top) をクランプするための入力。 */
export interface DragPos {
  readonly x: number;
  readonly y: number;
}

/** ダイアログのサイズ。 */
export interface DialogSize {
  readonly width: number;
  readonly height: number;
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

/**
 * Clamp a dragged dialog position so that the header/close button remains
 * accessible within the viewport.
 *
 * ヘッダー行の高さ分（minVisibleHeight）は常に viewport 内に留まるように
 * top/left をクランプする。右端・下端は dialogWidth/Height 全体が飛び出さない
 * ようにクランプする。
 *
 * @param pos ドラッグで算出した絶対座標 (left, top)
 * @param dialogSize ダイアログの実サイズ (px)
 * @param viewportWidth window.innerWidth
 * @param viewportHeight window.innerHeight
 * @param minVisibleHeight ヘッダー行の高さ — この分は必ず viewport 内に残す (px, default 44)
 */
export function clampDragPos(
  pos: DragPos,
  dialogSize: DialogSize,
  viewportWidth: number,
  viewportHeight: number,
  minVisibleHeight = 44,
): DragPos {
  const minX = -(dialogSize.width - minVisibleHeight);
  const maxX = viewportWidth - minVisibleHeight;
  const minY = 0;
  const maxY = viewportHeight - minVisibleHeight;
  return {
    x: Math.max(minX, Math.min(maxX, pos.x)),
    y: Math.max(minY, Math.min(maxY, pos.y)),
  };
}
