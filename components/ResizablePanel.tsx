"use client";

import { useRef, useState, useEffect, ReactNode } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ResizablePanelProps {
  children: ReactNode;
  side: "left" | "right";
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  className?: string;
  collapsible?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function ResizablePanel({
  children,
  side,
  defaultWidth = 256,
  minWidth = 200,
  maxWidth = 600,
  className,
  collapsible = false,
  isCollapsed = false,
  onToggleCollapse,
}: ResizablePanelProps) {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // defaultWidth の変更に追従（コンパクトモード切替時など）
  useEffect(() => {
    setWidth(defaultWidth);
  }, [defaultWidth]);

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
      className={clsx(
        "relative flex-shrink-0 transition-all duration-300 ease-in-out",
        className
      )}
      style={{ width: isCollapsed ? '0px' : `${width}px` }}
    >
      <div className={clsx(
        "h-full transition-opacity duration-300",
        isCollapsed ? "opacity-0" : "opacity-100"
      )}>
        {children}
      </div>

      {/* リサイズハンドル */}
      {!isCollapsed && (
        <div
          className={clsx(
            "absolute top-0 bottom-0 w-1 hover:w-1.5 bg-transparent hover:bg-accent transition-all cursor-col-resize z-10",
            side === "left" ? "right-0" : "left-0"
          )}
          onMouseDown={handleMouseDown}
        />
      )}

      {/* 折りたたみ/展開ボタン - collapsible が true の場合のみ表示 */}
      {collapsible && onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          className={clsx(
            "absolute top-4 z-20 w-6 h-12 flex items-center justify-center",
            "bg-background-secondary border border-border rounded-md",
            "hover:bg-hover transition-all duration-200",
            "shadow-sm hover:shadow-md",
            side === "left" 
              ? "right-0 translate-x-1/2" 
              : isCollapsed
                ? "left-0 -translate-x-full"
                : "left-0 -translate-x-1/2"
          )}
          title={isCollapsed ? "展開" : "折りたたむ"}
        >
          {side === "left" ? (
            isCollapsed ? <ChevronRight className="w-4 h-4 text-foreground-secondary" /> : <ChevronLeft className="w-4 h-4 text-foreground-secondary" />
          ) : (
            isCollapsed ? <ChevronLeft className="w-4 h-4 text-foreground-secondary" /> : <ChevronRight className="w-4 h-4 text-foreground-secondary" />
          )}
        </button>
      )}

      {/* リサイズ中の操作を安定させるためのオーバーレイ */}
      {isResizing && (
        <div className="fixed inset-0 z-50 cursor-col-resize" />
      )}
    </div>
  );
}
