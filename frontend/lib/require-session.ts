import { redirect } from "next/navigation";
import { hasSession } from "@/lib/server-api";

export async function requireSession(): Promise<void> {
  if (!(await hasSession())) {
    redirect("/login");
  }
}
