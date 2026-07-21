/** Paper catalogue is supplied by @illusions-lab/mdi-export-profile. */
import {
  PAGE_DIMENSIONS as UPSTREAM_PAGE_DIMENSIONS,
  PAGE_SIZES as UPSTREAM_PAGE_SIZES,
} from "@illusions-lab/mdi-export-profile";

export interface PageSizeEntry {
  key: string;
  label: string;
  width: number;
  height: number;
}

export interface PageSizeCategory {
  name: string;
  sizes: PageSizeEntry[];
}

export const PAGE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  ...UPSTREAM_PAGE_DIMENSIONS,
};
export const ALL_PAGE_SIZE_KEYS = new Set<string>(UPSTREAM_PAGE_SIZES);

export const PAGE_SIZE_CATEGORIES: PageSizeCategory[] = [
  {
    name: "MDI 標準用紙サイズ",
    sizes: UPSTREAM_PAGE_SIZES.map((key) => ({
      key,
      label: key,
      ...UPSTREAM_PAGE_DIMENSIONS[key],
    })),
  },
];

export function formatDimensions(key: string): string {
  const dimensions = PAGE_DIMENSIONS[key];
  return dimensions ? `${dimensions.width}×${dimensions.height} mm` : "";
}
