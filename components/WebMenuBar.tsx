'use client';

import { useState, useRef } from 'react';
import { WEB_MENU_STRUCTURE } from '@/lib/menu-definitions';
import { MenuDropdown } from './WebMenuBar/MenuDropdown';

interface WebMenuBarProps {
  onMenuAction: (action: string) => void;
}

export default function WebMenuBar({ onMenuAction }: WebMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const menuRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleMenuClick = (index: number) => {
    setOpenMenu(openMenu === index ? null : index);
  };

  const handleClose = () => {
    setOpenMenu(null);
  };

  return (
    <nav 
      className="h-10 bg-background border-b border-border flex items-center px-2 gap-1 flex-shrink-0"
      role="menubar"
    >
      {WEB_MENU_STRUCTURE.map((section, index) => (
        <div key={index} className="relative">
          <button
            ref={(el) => { menuRefs.current[index] = el; }}
            type="button"
            onClick={() => handleMenuClick(index)}
            className="px-3 py-1 text-sm text-foreground-secondary hover:bg-hover rounded transition-colors"
            aria-haspopup="true"
            aria-expanded={openMenu === index}
          >
            {section.label}
          </button>
          
          <MenuDropdown
            section={section}
            isOpen={openMenu === index}
            onClose={handleClose}
            onAction={onMenuAction}
            anchorRef={{ current: menuRefs.current[index] }}
          />
        </div>
      ))}
    </nav>
  );
}
