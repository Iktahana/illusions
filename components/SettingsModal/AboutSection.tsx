"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import clsx from "clsx";

const LICENSE_TEXT = process.env.NEXT_PUBLIC_LICENSE_TEXT || "";
const TERMS_TEXT = process.env.NEXT_PUBLIC_TERMS_TEXT || "";

/** Display version: show full version for CI builds (x.y.z where z > 0), otherwise first two parts */
const APP_VERSION = (() => {
  const v = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
  const parts = v.split(".");
  if (parts.length >= 3 && parts[2] !== "0") return v;
  return parts.slice(0, 2).join(".");
})();

interface CreditEntry {
  name: string;
  version: string;
  license: string;
  repository: string;
}

// Credits data is loaded lazily via dynamic import() to avoid:
// 1. require() which breaks Next.js RSC client manifest registration
// 2. Static ES import which fails tsc (credits.json is generated after type-check)

type AboutTab = "terms" | "license" | "credits";

export default function AboutSection(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<AboutTab>("terms");
  const [expandedCredits, setExpandedCredits] = useState<Set<string>>(new Set());
  const [creditsData, setCreditsData] = useState<CreditEntry[]>([]);

  useEffect(() => {
    import("@/generated/credits.json")
      .then((mod) => setCreditsData(mod.default as CreditEntry[]))
      .catch(() => { /* credits.json may not exist in dev */ });
  }, []);

  // Group credits by license type
  const creditsByLicense = creditsData.reduce<Record<string, CreditEntry[]>>((acc, entry) => {
    const key = entry.license || "Unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

  function handleExternalLink(e: React.MouseEvent<HTMLAnchorElement>): void {
    const url = e.currentTarget.href;
    if (window.electronAPI?.openExternal) {
      e.preventDefault();
      void window.electronAPI.openExternal(url);
    }
    // Web: default <a target="_blank"> behavior handles it
  }

  function handleToggleLicenseGroup(license: string): void {
    setExpandedCredits((prev) => {
      const next = new Set(prev);
      if (next.has(license)) {
        next.delete(license);
      } else {
        next.add(license);
      }
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* App info header */}
      <div className="text-center space-y-2">
        <h3 className="text-2xl font-bold text-foreground">illusions</h3>
        <p className="text-sm text-foreground-secondary">
          バージョン {APP_VERSION}
        </p>
        <p className="text-sm text-foreground-tertiary">
          © {new Date().getFullYear()} 幾田花 (Iktahana). All rights reserved.
        </p>
      </div>

      {/* Links */}
      <div className="flex justify-center gap-4">
        <a
          href="https://www.illusions.app"
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleExternalLink}
          className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          www.illusions.app
        </a>
        <a
          href="https://github.com/Iktahana/illusions"
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleExternalLink}
          className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          GitHub
        </a>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("terms")}
          className={clsx(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            activeTab === "terms"
              ? "border-accent text-accent"
              : "border-transparent text-foreground-secondary hover:text-foreground"
          )}
        >
          利用規約
        </button>
        <button
          onClick={() => setActiveTab("license")}
          className={clsx(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            activeTab === "license"
              ? "border-accent text-accent"
              : "border-transparent text-foreground-secondary hover:text-foreground"
          )}
        >
          LICENSE
        </button>
        <button
          onClick={() => setActiveTab("credits")}
          className={clsx(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            activeTab === "credits"
              ? "border-accent text-accent"
              : "border-transparent text-foreground-secondary hover:text-foreground"
          )}
        >
          CREDITS ({creditsData.length})
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "terms" && (
        <div className="rounded-lg border border-border bg-background-secondary overflow-hidden">
          <div
            className="p-4 text-sm text-foreground-secondary overflow-auto max-h-[40vh] leading-relaxed prose-about"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(TERMS_TEXT) }}
          />
        </div>
      )}

      {activeTab === "license" && (
        <div className="rounded-lg border border-border bg-background-secondary overflow-hidden">
          <pre className="p-4 text-xs text-foreground-secondary overflow-auto max-h-[40vh] whitespace-pre-wrap font-mono leading-relaxed text-center">
            {LICENSE_TEXT.replace(/^ {2,}/gm, "")}
          </pre>
        </div>
      )}

      {activeTab === "credits" && (
        <div className="space-y-2 max-h-[40vh] overflow-y-auto">
          {creditsData.length === 0 ? (
            <p className="text-sm text-foreground-tertiary text-center py-4">
              クレジットデータがありません。<code className="text-xs bg-background px-1 py-0.5 rounded">npm run generate:credits</code> を実行してください。
            </p>
          ) : (
            Object.entries(creditsByLicense)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([license, entries]) => (
                <div key={license} className="border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => handleToggleLicenseGroup(license)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-hover transition-colors"
                  >
                    {expandedCredits.has(license) ? (
                      <ChevronDown className="w-4 h-4 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 flex-shrink-0" />
                    )}
                    <span>{license}</span>
                    <span className="text-foreground-tertiary text-xs ml-auto">
                      {entries.length}
                    </span>
                  </button>
                  {expandedCredits.has(license) && (
                    <div className="border-t border-border divide-y divide-border">
                      {entries.map((entry) => (
                        <div
                          key={`${entry.name}@${entry.version}`}
                          className="px-3 py-1.5 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-foreground truncate">{entry.name}</span>
                            <span className="text-foreground-tertiary flex-shrink-0">
                              {entry.version}
                            </span>
                          </div>
                          {entry.repository && (
                            <a
                              href={entry.repository}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-accent hover:text-accent-hover flex-shrink-0 ml-2"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Markdown rendering utilities
// -----------------------------------------------------------------------

/** Lightweight markdown to HTML renderer for simple documents */
function renderMarkdown(md: string): string {
  const escape = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const lines = md.split("\n");
  const html: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      if (inList) { html.push("</ul>"); inList = false; }
      html.push('<hr class="my-4 border-border" />');
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.*)/);
    if (headingMatch) {
      if (inList) { html.push("</ul>"); inList = false; }
      const level = headingMatch[1].length;
      const text = inlineFormat(escape(headingMatch[2]));
      const sizes: Record<number, string> = { 1: "text-lg font-bold", 2: "text-base font-bold", 3: "text-sm font-semibold", 4: "text-sm font-medium" };
      html.push(`<h${level} class="${sizes[level] || "text-sm font-medium"} text-foreground mt-4 mb-2">${text}</h${level}>`);
      continue;
    }

    // List items (*, -)
    const listMatch = line.match(/^(\s*)[*\-]\s+(.*)/);
    if (listMatch) {
      if (!inList) { html.push('<ul class="list-disc pl-5 space-y-1">'); inList = true; }
      const indent = listMatch[1].length >= 4 ? ' class="ml-4"' : "";
      html.push(`<li${indent}>${inlineFormat(escape(listMatch[2]))}</li>`);
      continue;
    }

    // Close list if we hit a non-list line
    if (inList) { html.push("</ul>"); inList = false; }

    // Empty line
    if (line.trim() === "") {
      continue;
    }

    // Paragraph
    html.push(`<p class="mb-2">${inlineFormat(escape(line))}</p>`);
  }

  if (inList) html.push("</ul>");
  return html.join("\n");
}

/** Sanitize href to only allow safe protocols (http, https, mailto) */
function sanitizeHref(url: string): string {
  const trimmed = url.trim();
  // Allow relative URLs (starting with / or #) and safe absolute protocols
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    const safeProtocols = ["http:", "https:", "mailto:"];
    if (safeProtocols.includes(parsed.protocol)) {
      return trimmed;
    }
  } catch {
    // Not a valid absolute URL — allow as relative path if it has no colon-based scheme
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
      return trimmed;
    }
  }
  // Unsafe protocol detected — strip the href
  return "";
}

/** Render inline markdown: bold, links, code */
function inlineFormat(text: string): string {
  // Bold **text**
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>');
  // Links [text](url) — sanitize href to prevent XSS via javascript: or data: URLs
  text = text.replace(
    /\[(.+?)\]\((.+?)\)/g,
    (_match: string, linkText: string, url: string) => {
      const safeUrl = sanitizeHref(url);
      if (safeUrl) {
        const escapedUrl = safeUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
        return `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" class="text-accent hover:text-accent-hover underline">${linkText}</a>`;
      }
      // Unsafe URL — render as plain text without a link
      return linkText;
    }
  );
  // Inline code `text`
  text = text.replace(/`(.+?)`/g, '<code class="text-xs bg-background px-1 py-0.5 rounded">$1</code>');
  // Line break (two trailing spaces)
  text = text.replace(/ {2}$/, "<br />");
  return text;
}
