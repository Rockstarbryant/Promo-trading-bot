// Server Component data fetching: calls the backend directly (server-to-
// server, no cookie hop needed) using the token read from the httpOnly
// cookie. Never import this from a Client Component.
import { getBackendBaseUrl, getSessionToken } from "@/lib/session";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function serverApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getSessionToken();
  if (!token) throw new ApiError("Not authenticated", 401);

  const resp = await fetch(`${getBackendBaseUrl()}/api${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new ApiError(body.detail || `Request failed (${resp.status})`, resp.status);
  }
  if (resp.status === 204) return undefined as T;
  return resp.json();
}

export async function hasSession(): Promise<boolean> {
  return !!(await getSessionToken());
}
