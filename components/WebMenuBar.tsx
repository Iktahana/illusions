'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { WEB_MENU_STRUCTURE, ACTION_TO_COMMAND_ID } from '@/lib/menu/menu-definitions';
import { SHORTCUT_REGISTRY } from '@/lib/keymap/shortcut-registry';
import { loadKeymapOverrides } from '@/lib/keymap/keymap-storage';
import { toWebMenuAccelerator } from '@/lib/keymap/keymap-utils';
import { MenuDropdown } from './WebMenuBar/MenuDropdown';

import type { MenuSection, MenuItem } from '@/lib/menu/menu-definitions';
import type { KeymapOverrides } from '@/lib/keymap/keymap-types';

interface RecentProjectInfo {
  projectId: string;
  name: string;
  rootDirName?: string;
}

interface MenuCheckedState {
  compactMode?: boolean;
}

interface WebMenuBarProps {
  onMenuAction: (action: string) => void;
  recentProjects?: RecentProjectInfo[];
  checkedState?: MenuCheckedState;
}

export default function WebMenuBar({ onMenuAction, recentProjects, checkedState }: WebMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const menuRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Load user keymap overrides so accelerator labels reflect customizations
  const [keymapOverrides, setKeymapOverrides] = useState<KeymapOverrides>({});
  useEffect(() => {
    loadKeymapOverrides().then(setKeymapOverrides).catch(() => {
      // Silently fall back to defaults if overrides cannot be loaded
    });
  }, []);

  // Checked state map: action → boolean
  const checkedMap = useMemo<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    if (checkedState?.compactMode != null) {
      map['toggle-compact-mode'] = checkedState.compactMode;
    }
    return map;
  }, [checkedState]);

  // Inject recent projects, checked state, and dynamic accelerators into the menu structure
  const menuStructure = useMemo<MenuSection[]>(() => {
    /**
     * Resolves the accelerator string for a menu item by looking up the effective
     * key binding (user override if present, otherwise registry default).
     */
    function resolveAccelerator(action: string | undefined): string | undefined {
      if (!action) return undefined;
      const commandId = ACTION_TO_COMMAND_ID[action];
      if (!commandId) return undefined;
      // User override takes precedence; null override means intentionally unbound
      const effectiveBinding =
        commandId in keymapOverrides
          ? keymapOverrides[commandId]
          : SHORTCUT_REGISTRY[commandId]?.defaultBinding;
      return toWebMenuAccelerator(effectiveBinding ?? null);
    }

    return WEB_MENU_STRUCTURE.map((section) => {
      const items = section.items.map((item): MenuItem => {
        // Inject recent projects submenu
        if (item.action === 'open-recent-project' && section.label === 'ファイル') {
          const submenuItems: MenuItem[] =
            recentProjects && recentProjects.length > 0
              ? recentProjects.map((p) => ({
                  label: p.rootDirName ? `${p.name} (${p.rootDirName})` : p.name,
                  action: `open-recent-project:${p.projectId}`,
                }))
              : [];
          return { ...item, submenu: submenuItems };
        }

        // Inject checked state for checkbox items
        if (item.type === 'checkbox' && item.action && item.action in checkedMap) {
          return { ...item, checked: checkedMap[item.action], accelerator: resolveAccelerator(item.action) };
        }

        // Replace hardcoded accelerator with the effective user binding
        const accelerator = resolveAccelerator(item.action) ?? item.accelerator;
        return { ...item, accelerator };
      });

      return { ...section, items };
    });
  }, [recentProjects, checkedMap, keymapOverrides]);

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
