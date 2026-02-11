"use client";

import { useState, useCallback } from "react";
import {
  FileText,
  Settings,
  Search,
  Book,
  Layers,
  BarChart3,
  Users,
  BookOpen,
  Folder
} from "lucide-react";
import clsx from "clsx";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type ActivityBarView = "files" | "explorer" | "inspector" | "settings" | "search" | "outline" | "wordfreq" | "characters" | "dictionary" | "none";

interface ActivityBarItem {
  id: ActivityBarView;
  icon: typeof FileText;
  label: string;
  tooltip: string;
}

/** Top group: primary navigation (document/project structure) */
const DEFAULT_TOP_ITEMS: ActivityBarItem[] = [
  {
    id: "files",
    icon: Folder,
    label: "ファイル",
    tooltip: "ファイル"
  },
  {
    id: "explorer",
    icon: Layers,
    label: "エクスプローラー",
    tooltip: "エクスプローラー (Ctrl+Shift+E)"
  },
  {
    id: "search",
    icon: Search,
    label: "検索",
    tooltip: "検索 (Ctrl+Shift+F)"
  },
  {
    id: "outline",
    icon: Book,
    label: "アウトライン",
    tooltip: "アウトライン (Ctrl+Shift+O)"
  },
];

/** Bottom group: utilities and reference tools */
const DEFAULT_BOTTOM_ITEMS: ActivityBarItem[] = [
  {
    id: "characters",
    icon: Users,
    label: "登場人物",
    tooltip: "登場人物"
  },
  {
    id: "dictionary",
    icon: BookOpen,
    label: "辞書",
    tooltip: "辞書"
  },
  {
    id: "wordfreq",
    icon: BarChart3,
    label: "語彙統計",
    tooltip: "語彙統計"
  },
  {
    id: "settings",
    icon: Settings,
    label: "設定",
    tooltip: "設定 (Ctrl+,)"
  },
];

/** Set of view IDs that belong to the bottom group */
const BOTTOM_VIEW_IDS = new Set(DEFAULT_BOTTOM_ITEMS.map((item) => item.id));

/** Check whether a view belongs to the bottom group */
export function isBottomView(view: ActivityBarView): boolean {
  return BOTTOM_VIEW_IDS.has(view);
}

// --- localStorage helpers ---

const STORAGE_KEY_TOP = "illusions:sidebar-top-order";
const STORAGE_KEY_BOTTOM = "illusions:sidebar-bottom-order";

function loadOrder(key: string, defaultItems: ActivityBarItem[]): ActivityBarItem[] {
  if (typeof window === "undefined") return defaultItems;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultItems;
    const ids: string[] = JSON.parse(raw);
    const itemMap = new Map(defaultItems.map((item) => [item.id, item]));
    // Restore saved order, skipping IDs that no longer exist
    const ordered: ActivityBarItem[] = [];
    for (const id of ids) {
      const item = itemMap.get(id as ActivityBarView);
      if (item) {
        ordered.push(item);
        itemMap.delete(id as ActivityBarView);
      }
    }
    // Append any new items not in saved order
    for (const item of itemMap.values()) {
      ordered.push(item);
    }
    return ordered;
  } catch {
    return defaultItems;
  }
}

function saveOrder(key: string, items: ActivityBarItem[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items.map((item) => item.id)));
  } catch {
    // Ignore write failures
  }
}

// --- SortableButton sub-component ---

interface SortableButtonProps {
  item: ActivityBarItem;
  isActive: boolean;
  onClick: () => void;
}

function SortableButton({ item, isActive, onClick }: SortableButtonProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const Icon = item.icon;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={clsx(
        "w-10 h-10 flex items-center justify-center rounded-md transition-all relative group",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-foreground-tertiary hover:text-foreground hover:bg-hover",
        isDragging
          ? "opacity-50 scale-105 cursor-grabbing z-50"
          : "cursor-grab"
      )}
      title={item.tooltip}
      {...attributes}
      {...listeners}
    >
      <Icon className="w-5 h-5" />

      {/* アクティブインジケーター */}
      {isActive && !isDragging && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-accent-foreground rounded-r" />
      )}

      {/* ツールチップ */}
      {!isDragging && (
        <span className="absolute left-full ml-2 px-2 py-1 bg-background-elevated border border-border text-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
          {item.tooltip}
        </span>
      )}
    </button>
  );
}

// --- ActivityBar ---

interface ActivityBarProps {
  topView: ActivityBarView;
  bottomView: ActivityBarView;
  onTopViewChange: (view: ActivityBarView) => void;
  onBottomViewChange: (view: ActivityBarView) => void;
}

export default function ActivityBar({
  topView,
  bottomView,
  onTopViewChange,
  onBottomViewChange,
}: ActivityBarProps) {
  const [topItems, setTopItems] = useState<ActivityBarItem[]>(() =>
    loadOrder(STORAGE_KEY_TOP, DEFAULT_TOP_ITEMS)
  );
  const [bottomItems, setBottomItems] = useState<ActivityBarItem[]>(() =>
    loadOrder(STORAGE_KEY_BOTTOM, DEFAULT_BOTTOM_ITEMS)
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      // Determine which group the dragged item belongs to
      const topIndex = topItems.findIndex((item) => item.id === activeId);
      if (topIndex !== -1) {
        const overIndex = topItems.findIndex((item) => item.id === overId);
        if (overIndex !== -1) {
          const reordered = arrayMove(topItems, topIndex, overIndex);
          setTopItems(reordered);
          saveOrder(STORAGE_KEY_TOP, reordered);
        }
        return;
      }

      const bottomIndex = bottomItems.findIndex((item) => item.id === activeId);
      if (bottomIndex !== -1) {
        const overIndex = bottomItems.findIndex((item) => item.id === overId);
        if (overIndex !== -1) {
          const reordered = arrayMove(bottomItems, bottomIndex, overIndex);
          setBottomItems(reordered);
          saveOrder(STORAGE_KEY_BOTTOM, reordered);
        }
      }
    },
    [topItems, bottomItems]
  );

  return (
    <DndContext sensors={sensors} modifiers={[restrictToVerticalAxis, restrictToParentElement]} onDragEnd={handleDragEnd}>
      <div className="w-12 bg-background-tertiary border-r border-border flex flex-col items-center py-2 gap-1">
        {/* Top group */}
        <SortableContext
          items={topItems.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          {topItems.map((item) => (
            <SortableButton
              key={item.id}
              item={item}
              isActive={topView === item.id}
              onClick={() => {
                onTopViewChange(topView === item.id ? "none" : item.id);
              }}
            />
          ))}
        </SortableContext>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom group */}
        <SortableContext
          items={bottomItems.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          {bottomItems.map((item) => (
            <SortableButton
              key={item.id}
              item={item}
              isActive={bottomView === item.id}
              onClick={() => {
                onBottomViewChange(bottomView === item.id ? "none" : item.id);
              }}
            />
          ))}
        </SortableContext>
      </div>
    </DndContext>
  );
}
