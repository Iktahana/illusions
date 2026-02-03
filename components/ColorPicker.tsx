"use client";

import { useState, useRef, useEffect } from "react";
import clsx from "clsx";

// プリセットカラーパレット
const PRESET_COLORS = [
  // 赤系
  '#ef4444', '#dc2626', '#b91c1c', '#f87171',
  // オレンジ系
  '#f97316', '#ea580c', '#c2410c', '#fb923c',
  // 緑系
  '#22c55e', '#16a34a', '#15803d', '#4ade80',
  // 青系
  '#3b82f6', '#2563eb', '#1d4ed8', '#60a5fa',
  // 紫系
  '#a855f7', '#9333ea', '#7c3aed', '#c084fc',
  // ピンク系
  '#ec4899', '#db2777', '#be185d', '#f472b6',
  // ティール系
  '#14b8a6', '#0d9488', '#0f766e', '#2dd4bf',
  // グレー系
  '#6b7280', '#4b5563', '#374151', '#9ca3af',
];

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}

export default function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customColor, setCustomColor] = useState(value);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 外側クリックで閉じる
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectColor = (color: string) => {
    onChange(color);
    setCustomColor(color);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {label && (
        <label className="block text-xs font-medium text-foreground-tertiary mb-1">
          {label}
        </label>
      )}
      
      {/* 色プレビューボタン */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2 py-1.5 border border-border-secondary rounded hover:border-accent transition-colors"
      >
        <span
          className="w-5 h-5 rounded border border-border-secondary"
          style={{ backgroundColor: value }}
        />
        <span className="text-xs font-mono text-foreground-secondary">
          {value}
        </span>
      </button>

      {/* ドロップダウンカラーパネル */}
      {isOpen && (
        <div className="absolute right-0 z-50 mt-1 p-2 bg-background border border-border-secondary rounded-lg shadow-lg w-48">
          {/* プリセットカラーグリッド */}
          <div className="grid grid-cols-8 gap-0.5 mb-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => handleSelectColor(color)}
                className={clsx(
                  "w-4 h-4 rounded transition-transform hover:scale-110",
                  value === color && "ring-2 ring-accent ring-offset-1"
                )}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>

          {/* カスタムカラー入力 */}
          <div className="flex items-center gap-1.5 pt-2 border-t border-border">
            <input
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              className="w-6 h-6 flex-shrink-0 rounded cursor-pointer"
            />
            <input
              type="text"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              placeholder="#000000"
              className="min-w-0 flex-1 px-1.5 py-0.5 text-xs font-mono border border-border-secondary rounded focus:outline-none focus:ring-1 focus:ring-accent bg-background text-foreground"
            />
            <button
              type="button"
              onClick={() => handleSelectColor(customColor)}
              className="flex-shrink-0 px-1.5 py-0.5 text-xs font-medium bg-accent text-white rounded hover:bg-accent-hover"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
