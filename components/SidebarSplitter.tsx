"use client";

import { useState, useCallback, useRef, type ReactNode } from "react";

interface SidebarSplitterProps {
  top: ReactNode;
  bottom: ReactNode;
  /** Default split ratio as percentage (0–100). Defaults to 50. */
  defaultRatio?: number;
}

const MIN_RATIO = 20;
const MAX_RATIO = 80;

export default function SidebarSplitter({
  top,
  bottom,
  defaultRatio = 50,
}: SidebarSplitterProps) {
  const [ratio, setRatio] = useState(defaultRatio);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const startY = e.clientY;
      const startRatio = ratio;
      const containerHeight = container.getBoundingClientRect().height;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = moveEvent.clientY - startY;
        const deltaRatio = (deltaY / containerHeight) * 100;
        const newRatio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, startRatio + deltaRatio));
        setRatio(newRatio);
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [ratio]
  );

  return (
    <div ref={containerRef} className="flex flex-col h-full">
      {/* Top panel */}
      <div className="overflow-y-auto" style={{ height: `${ratio}%` }}>
        {top}
      </div>

      {/* Drag handle */}
      <div
        className="flex-shrink-0 h-1 cursor-row-resize bg-border hover:bg-accent transition-colors"
        onMouseDown={handleMouseDown}
      />

      {/* Bottom panel */}
      <div className="overflow-y-auto" style={{ height: `${100 - ratio}%` }}>
        {bottom}
      </div>
    </div>
  );
}
