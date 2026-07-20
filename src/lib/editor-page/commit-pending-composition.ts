import type { EditorView } from "@milkdown/prose/view";

/**
 * IME 変換中（composition 中）に保存 / flush が呼ばれたときのデータ整合性ガード（#1971）。
 *
 * ProseMirror は composition 中、未確定の変換テキストをブラウザ DOM に保持したまま
 * `state.doc` へ反映しない（compositionend で初めて反映する）。そのため保存経路が
 * `state.doc` を直接シリアライズすると、変換途中の未確定文字が抜け落ちる／挙動が不定に
 * なる（L-1 Cmd+S / L-2 自動保存 / L-3 Cmd+Q）。
 *
 * このヘルパーは保存直前に呼ばれ、composition 中であれば DOMObserver を強制フラッシュして
 * 未確定入力を可能な限り `state.doc` へ取り込む。
 *
 * 設計上の保証と限界:
 * - **composing でない通常経路は完全な no-op**（forceFlush を呼ばない）。既存の保存挙動を
 *   1 バイトも変えないため、#1840 / #1878 で安定した経路に退行を持ち込まない。
 * - composition のコミット可否は最終的にブラウザ / IME 実装に依存するため、これは
 *   best-effort であり完全な保証ではない。実機 IME（macOS / Windows）の手動 UI 検証が別途必要。
 *
 * @param view 対象の EditorView（未 ready なら null/undefined）
 * @returns composition のコミットを試みた（= 変換中だった）場合 true、通常経路は false
 */
export function commitPendingComposition(view: EditorView | null | undefined): boolean {
  if (!view) return false;

  // `composing` は EditorView の公開プロパティ。`input.composing` は内部実装だが、
  // 取りこぼしを避けるため両方を確認する（どちらかが true なら変換中とみなす）。
  const composing =
    view.composing === true ||
    (view as { input?: { composing?: boolean } }).input?.composing === true;
  if (!composing) return false;

  const observer = (view as { domObserver?: { forceFlush?: () => void } }).domObserver;
  try {
    observer?.forceFlush?.();
  } catch {
    // forceFlush に失敗しても保存自体は継続する（state.doc にフォールバック）。
    // ここで throw すると保存全体が中断し、かえってデータ保全を損なうため握り潰す。
  }
  return true;
}
