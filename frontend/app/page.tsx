import { redirect } from "next/navigation";
import { hasSession } from "@/lib/server-api";

export default async function RootPage() {
  redirect((await hasSession()) ? "/dashboard" : "/login");
}
