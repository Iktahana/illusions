/**
 * GitHub Device Flow - Access Token Polling API
 * 
 * Proxies access token polling requests to GitHub to avoid CORS issues in browser.
 */

import { NextRequest, NextResponse } from "next/server";

const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    if (!GITHUB_CLIENT_ID) {
      console.error("[GitHub Access Token] GITHUB_CLIENT_ID is not set");
      return NextResponse.json(
        { 
          error: "GitHub Client ID is not configured",
          details: "Please set GITHUB_CLIENT_ID in your .env.local file"
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { device_code } = body;

    if (!device_code) {
      return NextResponse.json(
        { error: "device_code is required" },
        { status: 400 }
      );
    }

    const response = await fetch(ACCESS_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to get access token: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Access token request error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
