"use client";

import { useRef, useState, useEffect, ReactNode } from "react";
import clsx from "clsx";

interface ResizablePanelProps {
  children: ReactNode;
  side: "left" | "right";
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  className?: string;
}

export default function ResizablePanel({
  children,
  side,
  defaultWidth = 256,
  minWidth = 200,
  maxWidth = 600,
  className,
}: ResizablePanelProps) {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!panelRef.current) return;

      const rect = panelRef.current.getBoundingClientRect();
      let newWidth: number;

      if (side === "left") {
        newWidth = e.clientX - rect.left;
      } else {
        newWidth = rect.right - e.clientX;
      }

      // 幅を min/max の範囲に収める
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    // リサイズ中のテキスト選択を防ぐ
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, side, minWidth, maxWidth]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  return (
    <div
      ref={panelRef}
      className={clsx("relative flex-shrink-0", className)}
      style={{ width: `${width}px` }}
    >
      {children}

      {/* リサイズハンドル */}
      <div
        className={clsx(
          "absolute top-0 bottom-0 w-1 hover:w-1.5 bg-transparent hover:bg-accent transition-all cursor-col-resize z-10",
          side === "left" ? "right-0" : "left-0"
        )}
        onMouseDown={handleMouseDown}
      />

      {/* リサイズ中の操作を安定させるためのオーバーレイ */}
      {isResizing && (
        <div className="fixed inset-0 z-50 cursor-col-resize" />
      )}
    </div>
  );
}
