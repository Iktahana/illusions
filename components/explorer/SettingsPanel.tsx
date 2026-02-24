"use client";

import { AlertCircle, ExternalLink } from "lucide-react";

/** Panel for general application settings and support */
export function SettingsPanel() {
  const handleReportAIIssue = () => {
    window.open("https://github.com/Iktahana/illusions/issues/new", "_blank");
  };

  return (
    <div className="space-y-4">
      {/* AI Content Report Section */}
      <div className="bg-background-secondary rounded-lg p-4 border border-border">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-foreground-tertiary mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-foreground mb-2">AIに関する不適切な提案を報告</h3>
            <p className="text-xs text-foreground-tertiary mb-3">
              AI校正機能が不適切な提案や出力をした場合、こちらからご報告ください。ご指摘は今後の改善に役立てさせていただきます。
            </p>
            <button
              onClick={handleReportAIIssue}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium bg-accent text-accent-foreground hover:bg-accent/90 rounded transition-colors"
            >
              GitHubで報告する
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
