import { NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl } from "@/lib/session";

export async function POST(req: NextRequest) {
  const payload = await req.json();

  const resp = await fetch(`${getBackendBaseUrl()}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return NextResponse.json({ detail: body.detail || "Registration failed" }, { status: resp.status });
  }
  return NextResponse.json(body, { status: resp.status });
}
