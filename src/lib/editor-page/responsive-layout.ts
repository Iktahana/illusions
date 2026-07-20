// 狭いウィンドウでのレイアウト判定（純粋関数）。#1856
//
// 狭いウィンドウで本文先頭やツールバーがクリップされるのを防ぐため、
// ウィンドウ幅に応じてサイドパネルを自動折りたたみするかどうかを決める。
// ここで決定するのは「表示上の上書き」だけで、ユーザーが保存したパネル状態
// （isRightPanelCollapsed など）は変更しない（永続レイアウトを壊さない）。

/** Electron BrowserWindow / Web ビューポートの最小幅・高さの床（px）。 */
export const MIN_WINDOW_WIDTH = 640;
export const MIN_WINDOW_HEIGHT = 480;

/** ActivityBar の幅（px）。Tailwind `w-12`(=48) / compact `w-10`(=40)。 */
const ACTIVITY_BAR_WIDTH = 48;
const ACTIVITY_BAR_WIDTH_COMPACT = 40;

/** サイドパネル（左右）の最小幅（px）。EditorLayout の minWidth と一致させる。 */
const SIDE_PANEL_MIN_WIDTH = 200;
const SIDE_PANEL_MIN_WIDTH_COMPACT = 160;

/** 本文（main）が読みやすさを保つために確保したい最小幅（px）。 */
export const MAIN_MIN_READABLE_WIDTH = 360;

export interface ResponsivePanelDecision {
  /** 左サイドパネル（ファイルツリー等）を表示上折りたたむか。 */
  collapseLeft: boolean;
  /** 右サイドパネル（インスペクタ）を表示上折りたたむか。 */
  collapseRight: boolean;
}

interface DecideParams {
  /** 現在のウィンドウ（ビューポート）幅（px）。 */
  windowWidth: number;
  /** コンパクトモードか（ActivityBar / パネル幅が縮む）。 */
  compactMode: boolean;
  /** ユーザー設定で右パネルが既に折りたたまれているか。 */
  rightAlreadyCollapsed: boolean;
}

/**
 * ウィンドウ幅から、サイドパネルを表示上自動折りたたみすべきかを決める。
 *
 * 優先順位:
 *   1. まず右パネル（インスペクタ）を畳んで本文幅を確保する。
 *   2. それでも本文が最小幅に満たなければ左パネルも畳む。
 *
 * これにより、狭いウィンドウでも本文（先頭文字を含む）が必ず可視のまま残る。
 */
export function decideResponsivePanels({
  windowWidth,
  compactMode,
  rightAlreadyCollapsed,
}: DecideParams): ResponsivePanelDecision {
  const activityBar = compactMode ? ACTIVITY_BAR_WIDTH_COMPACT : ACTIVITY_BAR_WIDTH;
  const panelMin = compactMode ? SIDE_PANEL_MIN_WIDTH_COMPACT : SIDE_PANEL_MIN_WIDTH;

  // 左パネルが開いている前提で、両パネル + ActivityBar を引いた本文幅を試算する。
  const mainWithBoth = windowWidth - activityBar - panelMin * 2;
  const mainWithRightCollapsed = windowWidth - activityBar - panelMin;

  // 右が既にユーザー設定で畳まれているなら、右の自動畳みは不要（状態を尊重）。
  const collapseRight = !rightAlreadyCollapsed && mainWithBoth < MAIN_MIN_READABLE_WIDTH;

  // 右を畳んでもなお本文が狭ければ左も畳む。
  const collapseLeft = mainWithRightCollapsed < MAIN_MIN_READABLE_WIDTH;

  return { collapseLeft, collapseRight };
}
