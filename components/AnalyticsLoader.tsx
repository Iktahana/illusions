"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { isElectronRenderer } from "@/lib/runtime-env";

export default function AnalyticsLoader() {
  if (isElectronRenderer()) return null;
  return (
    <>
      <SpeedInsights />
      <Analytics />
    </>
  );
}
