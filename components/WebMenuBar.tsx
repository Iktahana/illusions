'use client';

import { useState, useRef, useMemo } from 'react';
import { WEB_MENU_STRUCTURE } from '@/lib/menu-definitions';
import { MenuDropdown } from './WebMenuBar/MenuDropdown';

import type { MenuSection, MenuItem } from '@/lib/menu-definitions';

interface RecentProjectInfo {
  projectId: string;
  name: string;
  rootDirName?: string;
}

interface WebMenuBarProps {
  onMenuAction: (action: string) => void;
  recentProjects?: RecentProjectInfo[];
}

export default function WebMenuBar({ onMenuAction, recentProjects }: WebMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const menuRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Inject recent projects into the menu structure
  const menuStructure = useMemo<MenuSection[]>(() => {
    return WEB_MENU_STRUCTURE.map((section) => {
      if (section.label !== 'ファイル') return section;

      const items = section.items.map((item): MenuItem => {
        if (item.action !== 'open-recent-project') return item;

        const submenuItems: MenuItem[] =
          recentProjects && recentProjects.length > 0
            ? recentProjects.map((p) => ({
                label: p.rootDirName ? `${p.name} (${p.rootDirName})` : p.name,
                action: `open-recent-project:${p.projectId}`,
              }))
            : [];

        return {
          ...item,
          submenu: submenuItems,
        };
      });

      return { ...section, items };
    });
  }, [recentProjects]);

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
      {menuStructure.map((section, index) => (
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
