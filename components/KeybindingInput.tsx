"use client";

import { useEffect, useRef, useState } from "react";

import type { KeyBinding } from "@/lib/keymap/keymap-types";
import { buildBindingFromEvent, formatBinding, isReservedBinding } from "@/lib/keymap/keymap-utils";

interface KeybindingInputProps {
  onRecord: (binding: KeyBinding) => void;
  onCancel: () => void;
}

/**
 * An input area that listens for a key combination and records it as a KeyBinding.
 * Press Escape to cancel.
 */
export default function KeybindingInput({ onRecord, onCancel }: KeybindingInputProps) {
  const [preview, setPreview] = useState<string>("キーを押してください...");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      onCancel();
      return;
    }

    const binding = buildBindingFromEvent(e.nativeEvent);
    if (!binding) return;

    setPreview(formatBinding(binding));

    // Require at least one modifier for non-Tab keys
    if (binding.key !== "Tab" && binding.modifiers.length === 0) {
      setPreview(`${formatBinding(binding)} (修飾キーが必要です)`);
      return;
    }

    // Reject browser/OS reserved key combinations
    if (isReservedBinding(binding)) {
      setPreview(`${formatBinding(binding)} (予約済みキーです)`);
      return;
    }

    onRecord(binding);
  };

  return (
    <div
      ref={ref}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="px-3 py-2 rounded border border-accent bg-accent/10 text-sm text-foreground font-mono outline-none focus:ring-2 focus:ring-accent cursor-text min-w-[160px] text-center"
    >
      {preview}
    </div>
  );
}
