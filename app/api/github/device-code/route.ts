/**
 * GitHub Device Flow - Device Code Request API
 * 
 * Proxies device code requests to GitHub to avoid CORS issues in browser.
 */

import { NextRequest, NextResponse } from "next/server";

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const GITHUB_CLIENT_ID = "Ov23liN8mQW7MWEYb0Gs";

export async function POST(request: NextRequest) {
  try {
    const response = await fetch(DEVICE_CODE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        scope: "repo user",
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to request device code: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Device code request error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
