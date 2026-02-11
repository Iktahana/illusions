"use client";

import { createPortal } from "react-dom";
import type { ContextMenuState } from "@/lib/use-context-menu";

interface ContextMenuProps {
  menu: ContextMenuState;
  onAction: (action: string) => void;
  onClose: () => void;
}

export default function ContextMenu({ menu, onAction, onClose }: ContextMenuProps) {
  return createPortal(
    <div
      className="fixed z-50 py-1 border border-border rounded-md shadow-lg bg-background-elevated"
      style={{ left: menu.x, top: menu.y, width: 180 }}
      onClick={(e) => e.stopPropagation()}
    >
      {menu.items.map((item) => (
        <button
          key={item.action}
          className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-hover transition-colors whitespace-nowrap"
          onClick={() => {
            onClose();
            onAction(item.action);
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  );
}
