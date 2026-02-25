"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { ChevronRight, Check } from "lucide-react";
import clsx from "clsx";
import {
  FEATURED_JAPANESE_FONTS,
  ALL_JAPANESE_FONTS,
  LOCAL_SYSTEM_FONTS,
  ensureLocalFontAvailable,
  isElectronRuntime,
  loadGoogleFont,
} from "@/lib/utils/fonts";
import type { FontInfo, SystemFontInfo } from "@/lib/utils/fonts";

interface FontSelectorProps {
  value: string;
  onChange: (font: string) => void;
}

/** Font picker dropdown with system fonts, featured fonts, and search */
export function FontSelector({ value, onChange }: FontSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isElectron = useMemo(() => isElectronRuntime(), []);
  const platform = useMemo(() => {
    if (typeof navigator === 'undefined') {
      return null;
    }
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('mac')) {
      return 'mac';
    }
    if (ua.includes('win')) {
      return 'windows';
    }
    return null;
  }, []);

  const systemFonts = useMemo(() => {
    if (!isElectron) {
      return [];
    }
    if (!platform) {
      return LOCAL_SYSTEM_FONTS;
    }
    return LOCAL_SYSTEM_FONTS.filter((font: SystemFontInfo) =>
      font.platforms.includes(platform)
    );
  }, [isElectron, platform]);

  const systemFontFamilies = useMemo(
    () => new Set(systemFonts.map((font) => font.family)),
    [systemFonts]
  );

  const selectedFont = useMemo(
    () =>
      systemFonts.find((font) => font.family === value) ||
      ALL_JAPANESE_FONTS.find((font) => font.family === value),
    [systemFonts, value]
  );

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Preload featured fonts
  useEffect(() => {
    FEATURED_JAPANESE_FONTS.forEach((font: FontInfo) => {
      loadGoogleFont(font.family);
    });
  }, []);

  const handleSelect = (font: string) => {
    onChange(font);
    if (systemFontFamilies.has(font)) {
      void ensureLocalFontAvailable(font);
    } else {
      loadGoogleFont(font);
    }
    setIsOpen(false);
    setSearchTerm('');
  };

  // Filter fonts by search term (matching both family and localizedName)
  const filteredFonts = searchTerm
    ? ALL_JAPANESE_FONTS.filter((font: FontInfo) =>
        font.family.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (font.localizedName && font.localizedName.includes(searchTerm))
      )
    : ALL_JAPANESE_FONTS;

  const featuredFiltered = FEATURED_JAPANESE_FONTS.filter((font: FontInfo) =>
    !searchTerm ||
    font.family.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (font.localizedName && font.localizedName.includes(searchTerm))
  );

  const systemFiltered = systemFonts.filter((font: SystemFontInfo) =>
    !searchTerm ||
    font.family.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (font.localizedName && font.localizedName.includes(searchTerm))
  );

  const otherFonts = filteredFonts.filter(
    (font: FontInfo) => !FEATURED_JAPANESE_FONTS.find((f: FontInfo) => f.family === font.family)
  );

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selected font display */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 text-sm border border-border-secondary rounded focus:outline-none focus:ring-2 focus:ring-accent bg-background text-foreground text-left flex items-center justify-between"
        style={{ fontFamily: `"${value}", serif` }}
      >
        <span>
          {selectedFont?.localizedName || value}
        </span>
        <ChevronRight
          className={clsx(
            "w-4 h-4 transition-transform",
            isOpen ? "rotate-90" : "rotate-0"
          )}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-background border border-border-secondary rounded-lg shadow-lg max-h-80 overflow-hidden flex flex-col">
          {/* Search */}
          <div className="p-2 border-b border-border">
            <input
              type="text"
              placeholder="フォントを検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-border-secondary rounded focus:outline-none focus:ring-2 focus:ring-accent bg-background text-foreground"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Font list */}
          <div className="overflow-y-auto">
            {/* System fonts (Electron only) */}
            {systemFiltered.length > 0 && (
              <>
                {!searchTerm && (
                  <div className="px-3 py-1 text-xs font-semibold text-foreground-tertiary bg-background-secondary sticky top-0">
                    ローカル
                  </div>
                )}
                {systemFiltered.map(font => (
                  <button
                    key={font.family}
                    type="button"
                    onClick={() => handleSelect(font.family)}
                    className={clsx(
                      "w-full px-3 py-2 text-sm text-left hover:bg-active flex items-center justify-between transition-colors text-foreground",
                      value === font.family && "bg-accent-light"
                    )}
                    style={{ fontFamily: `"${font.family}", serif` }}
                  >
                    <span>{font.localizedName || font.family}</span>
                    {value === font.family && (
                      <Check className="w-4 h-4 text-accent" />
                    )}
                  </button>
                ))}
              </>
            )}

            {/* Featured */}
            {featuredFiltered.length > 0 && (
              <>
                  <div className="px-3 py-1 text-xs font-semibold text-foreground-tertiary bg-background-secondary sticky top-0">
                  おすすめ
                </div>
                {featuredFiltered.map(font => (
                  <button
                    key={font.family}
                    type="button"
                    onClick={() => handleSelect(font.family)}
                    className={clsx(
                      "w-full px-3 py-2 text-sm text-left hover:bg-active flex items-center justify-between transition-colors text-foreground",
                      value === font.family && "bg-accent-light"
                    )}
                    style={{ fontFamily: `"${font.family}", serif` }}
                  >
                    <span>{font.localizedName || font.family}</span>
                    {value === font.family && (
                      <Check className="w-4 h-4 text-accent" />
                    )}
                  </button>
                ))}
              </>
            )}

            {/* All fonts */}
            {otherFonts.length > 0 && (
              <>
                {!searchTerm && (
                <div className="px-3 py-1 text-xs font-semibold text-foreground-tertiary bg-background-secondary sticky top-0">
                    すべてのフォント
                  </div>
                )}
                {otherFonts.map(font => (
                  <button
                    key={font.family}
                    type="button"
                    onClick={() => handleSelect(font.family)}
                    className={clsx(
                      "w-full px-3 py-2 text-sm text-left hover:bg-active flex items-center justify-between transition-colors text-foreground",
                      value === font.family && "bg-accent-light"
                    )}
                    style={{ fontFamily: `"${font.family}", serif` }}
                  >
                    <span>{font.localizedName || font.family}</span>
                    {value === font.family && (
                      <Check className="w-4 h-4 text-accent" />
                    )}
                  </button>
                ))}
              </>
            )}

            {/* No results */}
            {systemFiltered.length === 0 && featuredFiltered.length === 0 && otherFonts.length === 0 && (
              <div className="px-3 py-4 text-sm text-foreground-tertiary text-center">
                フォントが見つかりません
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
