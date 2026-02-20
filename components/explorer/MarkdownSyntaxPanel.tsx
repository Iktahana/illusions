"use client";

import { X } from "lucide-react";
import GlassDialog from "@/components/GlassDialog";

interface MarkdownSyntaxPanelProps {
  onClose: () => void;
  onInsertText: (text: string) => void;
}

/** Dialog showing markdown heading syntax examples with insert actions */
export function MarkdownSyntaxPanel({ onClose, onInsertText }: MarkdownSyntaxPanelProps) {
  const syntaxExamples = [
    { syntax: "# 見出し", description: "レベル1の見出し", example: "# 第一章", fontSize: "2em" },
    { syntax: "## 見出し", description: "レベル2の見出し", example: "## 第一節", fontSize: "1.5em" },
    { syntax: "### 見出し", description: "レベル3の見出し", example: "### シーン1", fontSize: "1.17em" },
    { syntax: "#### 見出し", description: "レベル4の見出し", example: "#### セクション", fontSize: "1em" },
    { syntax: "##### 見出し", description: "レベル5の見出し", example: "##### サブセクション", fontSize: "0.83em" },
    { syntax: "###### 見出し", description: "レベル6の見出し", example: "###### 詳細", fontSize: "0.67em" },
  ];

  return (
    <GlassDialog
      isOpen={true}
      onBackdropClick={onClose}
      panelClassName="w-[500px] max-h-[80vh] overflow-hidden flex flex-col p-0"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background-secondary/50 rounded-t-xl">
        <h3 className="text-sm font-semibold text-foreground">
          章の見出しを追加
        </h3>
        <button
          onClick={onClose}
          className="p-1 text-foreground-tertiary hover:text-foreground-secondary hover:bg-hover rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {syntaxExamples.map((item, index) => (
            <button
              key={index}
              onClick={() => onInsertText(item.example)}
              className="w-full p-3 bg-background-secondary rounded-lg border border-border hover:border-accent hover:bg-active transition-colors text-left"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <code className="text-sm font-mono text-accent bg-background px-2 py-0.5 rounded">
                  {item.syntax}
                </code>
                <span className="text-xs text-foreground-tertiary">{item.description}</span>
              </div>
              <div className="text-foreground-secondary mt-2 pl-2 border-l-2 border-border-secondary">
                {item.example.split('\n').map((line, i) => (
                  <div
                    key={i}
                    className="font-mono"
                    style={{ fontSize: item.fontSize }}
                  >
                    {line}
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>

        {/* Hints */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="text-xs font-semibold text-blue-800 mb-2">ヒント</h4>
          <ul className="text-xs text-blue-700 space-y-1">
            <li>見出しの後には空行が必要です</li>
            <li># の数が多いほど、小さな見出しになります</li>
            <li>見出しは章の構造を表すのに使います</li>
          </ul>
        </div>
      </div>
    </GlassDialog>
  );
}
