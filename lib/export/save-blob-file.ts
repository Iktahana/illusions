/**
 * Shared file-save helper for browser and Electron.
 *
 * Phase 2: Electron TXT 分岐は save-file IPC 削除に伴い無効化。両環境とも
 * Blob URL ダウンロードにフォールバック。Phase 8 で新 IO 抽象が出来たら
 * Electron のネイティブ Save ダイアログ経路を復活させる。
 *
 * 他の Electron formats (PDF, DOCX, EPUB) は専用 IPC export handler を経由するため
 * 本関数を通らない。
 */

/**
 * Save a Blob to a file.
 *
 * @param blob - Blob content to write
 * @param suggestedName - Default file name for the download / save dialog
 * @param _isElectron - Phase 2 で不使用（互換のため signature 維持）
 * @param _electronExt - Phase 2 で不使用（互換のため signature 維持）
 * @returns true（ダウンロードは常に成功とみなす）
 */
export async function saveBlobFile(
  blob: Blob,
  suggestedName: string,
  _isElectron: boolean,
  _electronExt?: string,
): Promise<boolean> {
  // Phase 2: 環境問わず Blob URL ダウンロードへ。Phase 8 で Electron ネイティブ復活。
  downloadViaBlob(blob, suggestedName);
  return true;
}

/**
 * Download a Blob via a temporary <a> element. Always works without a user gesture.
 */
function downloadViaBlob(blob: Blob, suggestedName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
