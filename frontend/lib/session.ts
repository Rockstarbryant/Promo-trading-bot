// Server-only helpers for reading/writing the auth cookie. Never imported
// from a Client Component — the JWT must never reach browser JS.
// Next.js 15: cookies() is async.
import { cookies } from "next/headers";

export const SESSION_COOKIE = "promo_trader_session";

export function getBackendBaseUrl(): string {
  return process.env.BACKEND_API_BASE_URL || "http://localhost:8000";
}

export async function getSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60, // 1 hour, matches backend ACCESS_TOKEN_EXPIRE_MINUTES default
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
