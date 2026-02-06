/**
 * GitHub Device Flow - Device Code Request API
 * 
 * Proxies device code requests to GitHub to avoid CORS issues in browser.
 */

import { NextRequest, NextResponse } from "next/server";

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    if (!GITHUB_CLIENT_ID) {
      console.error("[GitHub Device Code] GITHUB_CLIENT_ID is not set");
      return NextResponse.json(
        { 
          error: "GitHub Client ID is not configured",
          details: "Please set GITHUB_CLIENT_ID in your .env.local file"
        },
        { status: 500 }
      );
    }

    console.log("[GitHub Device Code] Requesting device code...");
    console.log("[GitHub Device Code] Client ID:", GITHUB_CLIENT_ID);
    
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

    console.log("[GitHub Device Code] Response status:", response.status);
    console.log("[GitHub Device Code] Response statusText:", response.statusText);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[GitHub Device Code] Error response body:", errorBody);
      return NextResponse.json(
        { 
          error: `Failed to request device code: ${response.statusText}`,
          details: errorBody 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log("[GitHub Device Code] Success! User code:", data.user_code);
    return NextResponse.json(data);
  } catch (error) {
    console.error("[GitHub Device Code] Exception:", error);
    return NextResponse.json(
      { 
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
