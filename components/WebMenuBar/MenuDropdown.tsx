'use client';

import { useEffect, useRef } from 'react';
import { MenuSection } from '@/lib/menu/menu-definitions';
import { MenuItem } from './MenuItem';

interface MenuDropdownProps {
  section: MenuSection;
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: string) => void;
  anchorRef: React.RefObject<HTMLElement>;
}

export function MenuDropdown({ 
  section, 
  isOpen, 
  onClose, 
  onAction,
  anchorRef 
}: MenuDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, anchorRef]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full left-0 mt-1 min-w-[220px] bg-background-elevated border border-border rounded-md shadow-lg py-1 z-50"
      role="menu"
      style={{
        animation: 'fadeIn 100ms ease-out'
      }}
    >
      {section.items.map((item, index) => (
        <MenuItem
          key={index}
          item={item}
          onClick={onAction}
          onClose={onClose}
        />
      ))}
    </div>
  );
}
