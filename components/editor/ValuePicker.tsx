"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

/** Dropdown for picking a numeric value from a list */
export default function ValuePicker({
  value,
  label,
  options,
  onChange,
  unit = "",
}: {
  value: number;
  label: string;
  options: number[];
  onChange: (v: number) => void;
  unit?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="hover:text-foreground transition-colors cursor-pointer"
        title={label}
      >
        {label}
      </button>
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 min-w-[56px] max-h-[200px] overflow-y-auto rounded-lg border border-border bg-background-secondary shadow-lg py-1 text-xs">
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              className={clsx(
                "block w-full px-3 py-1 text-center hover:bg-white/5 transition-colors",
                opt === value ? "text-accent font-semibold" : "text-foreground-secondary"
              )}
            >
              {(opt % 1 === 0 ? opt : opt.toFixed(1)) + unit}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
