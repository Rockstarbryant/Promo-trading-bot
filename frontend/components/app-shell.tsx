"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard, Wallet, Trophy, Sliders, Bot, Receipt, BarChart3,
  Settings, LogOut,
} from "lucide-react";
import { logoutRequest } from "@/lib/api-client";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/promotions", label: "Promotions", icon: Trophy },
  { href: "/strategies", label: "Strategies", icon: Sliders },
  { href: "/bots", label: "Bots", icon: Bot },
  { href: "/orders", label: "Orders", icon: Receipt },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const isAuthPage = pathname === "/login" || pathname === "/";

  if (isAuthPage) {
    return <>{children}</>;
  }

  async function handleLogout() {
    await logoutRequest();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-56 md:flex-col md:border-r md:border-ink-600 md:bg-ink-800">
        <div className="px-4 py-5">
          <div className="text-sm font-semibold tracking-tight text-ash-50">Promo Trader</div>
          <div className="text-xs text-ash-400">Binance Spot volume</div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2">
          {NAV_ITEMS.map((item) => {
            const active = pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors ${
                  active ? "bg-ink-700 text-signal" : "text-ash-200 hover:bg-ink-700 hover:text-ash-50"
                }`}
              >
                <Icon size={16} strokeWidth={2} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={handleLogout}
          className="mx-2 mb-4 flex items-center gap-3 rounded px-3 py-2 text-sm text-ash-400 hover:bg-ink-700 hover:text-ash-50"
        >
          <LogOut size={16} strokeWidth={2} />
          Sign out
        </button>
      </aside>

      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b border-ink-600 bg-ink-800 px-4 py-3 md:hidden">
        <div className="text-sm font-semibold text-ash-50">Promo Trader</div>
        <button onClick={handleLogout} className="text-ash-400" aria-label="Sign out">
          <LogOut size={18} />
        </button>
      </header>

      <main className="flex-1 overflow-x-hidden pb-20 md:pb-0">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-ink-600 bg-ink-800 py-1.5 md:hidden">
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] ${
                active ? "text-signal" : "text-ash-400"
              }`}
            >
              <Icon size={20} strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
