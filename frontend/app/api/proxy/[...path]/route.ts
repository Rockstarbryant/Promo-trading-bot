import { NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl, getSessionToken } from "@/lib/session";

// Every other API call (accounts, promotions, strategies, bots, orders,
// analytics) goes through here. The browser only ever talks to
// /api/proxy/*; the JWT is attached server-side from the httpOnly cookie
// and never appears in client-side JavaScript or network tab request
// bodies the client constructed itself.

async function handle(req: NextRequest, params: { path: string[] }) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const targetPath = params.path.join("/");
  const search = req.nextUrl.search;
  const url = `${getBackendBaseUrl()}/api/${targetPath}${search}`;

  const init: RequestInit = {
    method: req.method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": req.headers.get("content-type") || "application/json",
    },
    cache: "no-store",
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    const bodyText = await req.text();
    if (bodyText) init.body = bodyText;
  }

  const resp = await fetch(url, init);
  const contentType = resp.headers.get("content-type") || "";

  if (resp.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  if (contentType.includes("application/json")) {
    const data = await resp.json().catch(() => null);
    return NextResponse.json(data, { status: resp.status });
  }

  const text = await resp.text();
  return new NextResponse(text, { status: resp.status });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, await ctx.params);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, await ctx.params);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, await ctx.params);
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, await ctx.params);
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, await ctx.params);
}
