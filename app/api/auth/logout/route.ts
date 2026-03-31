import { NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/auth/auth-cookies";

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ success: true });
  clearAuthCookies(response);
  return response;
}
