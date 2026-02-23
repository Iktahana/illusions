"use client";

import { useEffect, useState } from "react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { isElectronRenderer } from "@/lib/runtime-env";

export default function AnalyticsLoader(): JSX.Element | null {
  const [showAnalytics, setShowAnalytics] = useState(false);

  useEffect(() => {
    if (!isElectronRenderer()) {
      setShowAnalytics(true);
    }
  }, []);

  if (!showAnalytics) return null;
  return (
    <>
      <SpeedInsights />
      <Analytics />
    </>
  );
}
