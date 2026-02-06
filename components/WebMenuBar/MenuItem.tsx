'use client';

import { MenuItem as MenuItemType, formatAccelerator } from '@/lib/menu-definitions';

interface MenuItemProps {
  item: MenuItemType;
  onClick: (action: string) => void;
  onClose: () => void;
}

export function MenuItem({ item, onClick, onClose }: MenuItemProps) {
  if (item.type === 'separator') {
    return <div className="h-px bg-border my-1" />;
  }

  const handleClick = () => {
    if (item.action && item.enabled !== false) {
      onClick(item.action);
      onClose();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={item.enabled === false}
      className="w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-8 hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      <span className="text-foreground">{item.label}</span>
      {item.accelerator && (
        <span className="text-xs text-foreground-tertiary font-mono">
          {formatAccelerator(item.accelerator)}
        </span>
      )}
    </button>
  );
}
