import { NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl, setSessionCookie } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  const form = new URLSearchParams();
  form.set("username", email);
  form.set("password", password);

  const resp = await fetch(`${getBackendBaseUrl()}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    cache: "no-store",
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ detail: "Login failed" }));
    return NextResponse.json({ detail: body.detail || "Incorrect email or password" }, { status: resp.status });
  }

  const data = await resp.json();
  await setSessionCookie(data.access_token);
  return NextResponse.json({ ok: true });
}
