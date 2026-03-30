"use client";

import GlassDialog from "@/components/GlassDialog";
import type { UserDictionaryEntry } from "@/lib/project/project-types";

// Predefined POS values matching PosType
const POS_OPTIONS = [
  "名詞",
  "動詞",
  "形容詞",
  "副詞",
  "助詞",
  "助動詞",
  "接続詞",
  "感動詞",
  "記号",
  "連体詞",
  "フィラー",
  "その他",
] as const;

interface DictionaryEntryDialogProps {
  isOpen: boolean;
  editingEntry: UserDictionaryEntry | null;
  formData: Partial<UserDictionaryEntry>;
  onFormChange: (data: Partial<UserDictionaryEntry>) => void;
  onClose: () => void;
  onSave: () => void;
}

export default function DictionaryEntryDialog({
  isOpen,
  editingEntry,
  formData,
  onFormChange,
  onClose,
  onSave,
}: DictionaryEntryDialogProps) {
  return (
    <GlassDialog
      isOpen={isOpen}
      onBackdropClick={onClose}
      ariaLabel={editingEntry ? "辞書項目を編集" : "新しい辞書項目を追加"}
      panelClassName="mx-4 w-full max-w-lg p-6"
    >
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">
          {editingEntry ? "辞書項目を編集" : "新しい辞書項目を追加"}
        </h3>

        <div className="space-y-3">
          {/* Word (required) */}
          <div>
            <label className="text-xs font-medium text-foreground-secondary mb-1 block">
              見出し語 *
            </label>
            <input
              type="text"
              placeholder="例: 幻想"
              value={formData.word || ""}
              onChange={(e) => onFormChange({ ...formData, word: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              autoFocus
            />
          </div>

          {/* Reading */}
          <div>
            <label className="text-xs font-medium text-foreground-secondary mb-1 block">
              読み方
            </label>
            <input
              type="text"
              placeholder="例: げんそう"
              value={formData.reading || ""}
              onChange={(e) => onFormChange({ ...formData, reading: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* POS - Dropdown */}
          <div>
            <label className="text-xs font-medium text-foreground-secondary mb-1 block">品詞</label>
            <select
              value={formData.partOfSpeech || ""}
              onChange={(e) => onFormChange({ ...formData, partOfSpeech: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">選択してください</option>
              {POS_OPTIONS.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
          </div>

          {/* Definition (optional) */}
          <div>
            <label className="text-xs font-medium text-foreground-secondary mb-1 block">意味</label>
            <textarea
              placeholder="この言葉の意味を入力してください"
              value={formData.definition || ""}
              onChange={(e) => onFormChange({ ...formData, definition: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
              rows={3}
            />
          </div>

          {/* Examples */}
          <div>
            <label className="text-xs font-medium text-foreground-secondary mb-1 block">用例</label>
            <textarea
              placeholder="使用例を入力してください"
              value={formData.examples || ""}
              onChange={(e) => onFormChange({ ...formData, examples: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
              rows={2}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-foreground-secondary mb-1 block">メモ</label>
            <textarea
              placeholder="メモや補足情報を入力してください"
              value={formData.notes || ""}
              onChange={(e) => onFormChange({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
              rows={2}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-foreground-secondary hover:text-foreground transition-colors rounded hover:bg-hover"
          >
            キャンセル
          </button>
          <button
            onClick={onSave}
            disabled={!formData.word?.trim()}
            className="px-4 py-2 text-sm bg-accent text-accent-foreground rounded hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {editingEntry ? "保存" : "追加"}
          </button>
        </div>
      </div>
    </GlassDialog>
  );
}
