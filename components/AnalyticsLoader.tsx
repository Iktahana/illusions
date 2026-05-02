"use client";

import { useEffect, useState } from "react";
import type React from "react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { isElectronRenderer } from "@/lib/utils/runtime-env";

export default function AnalyticsLoader(): React.ReactElement | null {
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
