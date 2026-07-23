export const PDF_PREVIEW_LOW_MEMORY_PAGES = 32;
export const PDF_PREVIEW_DEFAULT_PAGES = 300;
export const PDF_PREVIEW_ABSOLUTE_MAX_PAGES = 500;
export const PDF_PREVIEW_MANUAL_PAGE_LIMITS = [32, 100, 200, 300, 500] as const;

export type PdfPreviewManualPageLimit = (typeof PDF_PREVIEW_MANUAL_PAGE_LIMITS)[number];
export type PdfPreviewMaxPagesPreference = "auto" | `${PdfPreviewManualPageLimit}`;

export interface PdfPreviewPagePolicy {
  automaticMaxPages: number;
  maxPages: number;
}

export function isPdfPreviewManualPageLimit(value: unknown): value is PdfPreviewManualPageLimit {
  return PDF_PREVIEW_MANUAL_PAGE_LIMITS.some((candidate) => candidate === value);
}

export function isPdfPreviewMaxPagesPreference(
  value: unknown,
): value is PdfPreviewMaxPagesPreference {
  return (
    value === "auto" ||
    (typeof value === "string" &&
      PDF_PREVIEW_MANUAL_PAGE_LIMITS.some((candidate) => String(candidate) === value))
  );
}

/** Select a bounded preview size from installed physical memory. */
export function pdfPreviewPageLimitForMemory(totalMemoryBytes: number): number {
  const gibibytes = totalMemoryBytes / 1024 ** 3;
  if (!Number.isFinite(gibibytes) || gibibytes <= 8) return PDF_PREVIEW_LOW_MEMORY_PAGES;
  if (gibibytes <= 16) return 100;
  if (gibibytes <= 24) return 200;
  if (gibibytes < 64) return PDF_PREVIEW_DEFAULT_PAGES;
  return PDF_PREVIEW_ABSOLUTE_MAX_PAGES;
}

/** Resolve an untrusted IPC override against the choices exposed in Settings. */
export function resolvePdfPreviewPagePolicy(
  totalMemoryBytes: number,
  requestedMaxPages?: unknown,
): PdfPreviewPagePolicy {
  const automaticMaxPages = pdfPreviewPageLimitForMemory(totalMemoryBytes);
  return {
    automaticMaxPages,
    maxPages: isPdfPreviewManualPageLimit(requestedMaxPages)
      ? requestedMaxPages
      : automaticMaxPages,
  };
}
