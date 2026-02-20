'use client';

import { useState, useRef } from 'react';
import { MenuItem as MenuItemType, formatAccelerator } from '@/lib/menu-definitions';

interface MenuItemProps {
  item: MenuItemType;
  onClick: (action: string) => void;
  onClose: () => void;
}

export function MenuItem({ item, onClick, onClose }: MenuItemProps) {
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (item.type === 'separator') {
    return <div className="h-px bg-border my-1" />;
  }

  const hasSubmenu = item.submenu !== undefined;

  const handleClick = () => {
    if (hasSubmenu) return;
    if (item.action && item.enabled !== false) {
      onClick(item.action);
      onClose();
    }
  };

  const handleMouseEnter = () => {
    if (!hasSubmenu) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setSubmenuOpen(true);
  };

  const handleMouseLeave = () => {
    if (!hasSubmenu) return;
    hoverTimeoutRef.current = setTimeout(() => {
      setSubmenuOpen(false);
    }, 150);
  };

  return (
    <div
      ref={itemRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={item.enabled === false && !hasSubmenu}
        className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <span className="text-foreground flex-1">{item.label}</span>
        {hasSubmenu ? (
          <svg width="12" height="12" viewBox="0 0 12 12" className="text-foreground-tertiary flex-shrink-0">
            <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        ) : item.accelerator ? (
          <span className="text-xs text-foreground-tertiary font-mono">
            {formatAccelerator(item.accelerator)}
          </span>
        ) : null}
        {/* Checkbox checkmark area — always rightmost */}
        {item.type === 'checkbox' ? (
          <span className="w-4 flex-shrink-0 text-center text-foreground">
            {item.checked ? '✓' : ''}
          </span>
        ) : null}
      </button>

      {/* Submenu dropdown */}
      {hasSubmenu && submenuOpen && (
        <div
          className="absolute top-0 left-full ml-0.5 min-w-[200px] bg-background-elevated border border-border rounded-md shadow-lg py-1 z-50"
          role="menu"
          style={{ animation: 'fadeIn 100ms ease-out' }}
        >
          {item.submenu!.length === 0 ? (
            <div className="px-3 py-1.5 text-sm text-foreground-tertiary">
              項目なし
            </div>
          ) : (
            item.submenu!.map((subItem, index) => (
              <button
                key={index}
                type="button"
                onClick={() => {
                  if (subItem.action && subItem.enabled !== false) {
                    onClick(subItem.action);
                    onClose();
                  }
                }}
                disabled={subItem.enabled === false}
                className="w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-4 hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span className="text-foreground truncate">{subItem.label}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
