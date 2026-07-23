"use client";

import { useState } from "react";

import {
  localPreferences,
  type PdfPreviewMaxPagesPreference,
} from "@/lib/storage/local-preferences";
import { SelectField, SettingsSection } from "./primitives";

const PDF_PREVIEW_PAGE_OPTIONS = [
  {
    value: "auto",
    label: "自動（推奨）",
    description: "システムメモリに合わせて、32～500ページの範囲で自動調整します。",
  },
  { value: "32", label: "32ページ" },
  { value: "100", label: "100ページ" },
  { value: "200", label: "200ページ" },
  { value: "300", label: "300ページ" },
  { value: "500", label: "500ページ" },
] as const;

export default function ExportSettingsTab(): React.ReactElement {
  const [maxPages, setMaxPages] = useState<PdfPreviewMaxPagesPreference>(() =>
    localPreferences.getPdfPreviewMaxPages(),
  );

  const handleChange = (value: PdfPreviewMaxPagesPreference) => {
    setMaxPages(value);
    localPreferences.setPdfPreviewMaxPages(value);
  };

  return (
    <SettingsSection
      title="PDFプレビュー"
      description="プレビューに表示する最大ページ数を設定します。PDFファイルへの書き出しには影響しません。"
    >
      <SelectField
        label="最大ページ数"
        value={maxPages}
        options={PDF_PREVIEW_PAGE_OPTIONS}
        onChange={handleChange}
      />
      <p className="text-xs leading-relaxed text-foreground-tertiary">
        「自動（推奨）」では、搭載メモリに合わせて32～500ページの範囲で調整します。
        ページ数を増やすと、プレビューの生成に時間がかかり、使用メモリも増えます。
        動作が重い場合は、ページ数を少なくしてください。
      </p>
    </SettingsSection>
  );
}
