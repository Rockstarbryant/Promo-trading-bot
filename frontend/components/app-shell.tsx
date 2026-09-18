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
    <div className="flex min-h-screen flex-col md:flex-row bg-gray-50 font-sans selection:bg-yellow-400 selection:text-black">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:border-r-4 md:border-black md:bg-white z-20">
        <div className="border-b-4 border-black px-5 py-6 bg-yellow-400">
          <div className="text-xl font-black uppercase tracking-tighter text-black">Promo Trader</div>
          <div className="text-xs font-bold uppercase tracking-widest text-black mt-1">Binance Engine</div>
        </div>
        <nav className="flex flex-1 flex-col gap-2 p-4">
          {NAV_ITEMS.map((item) => {
            const active = pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 border-2 px-3 py-2.5 text-sm font-black uppercase tracking-widest transition-none ${
                  active
                    ? "border-black bg-black text-white shadow-[4px_4px_0px_rgba(0,0,0,1)]"
                    : "border-transparent text-black hover:border-black hover:bg-yellow-200"
                }`}
              >
                <Icon size={18} strokeWidth={2.5} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={handleLogout}
          className="m-4 flex items-center justify-center gap-2 border-2 border-black bg-red-400 px-4 py-3 text-sm font-black uppercase tracking-widest text-black hover:bg-black hover:text-white transition-none shadow-[4px_4px_0px_rgba(0,0,0,1)]"
        >
          <LogOut size={18} strokeWidth={2.5} />
          Sign out
        </button>
      </aside>

      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b-4 border-black bg-yellow-400 px-4 py-3 md:hidden z-20">
        <div className="text-lg font-black uppercase tracking-tighter text-black">Promo Trader</div>
        <button onClick={handleLogout} className="border-2 border-black bg-white p-1 hover:bg-red-400 transition-none" aria-label="Sign out">
          <LogOut size={20} strokeWidth={2.5} className="text-black" />
        </button>
      </header>

      <main className="flex-1 overflow-x-hidden pb-16 md:pb-0 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>

      {/* Mobile bottom nav — horizontal scroll so all tabs are reachable */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t-4 border-black bg-white md:hidden overflow-x-auto overscroll-x-contain">
        <div className="flex w-max min-w-full justify-start gap-1 px-2 py-1.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex shrink-0 flex-col items-center gap-0.5 px-2.5 py-1.5 border-2 transition-none ${
                  active
                    ? "border-black bg-yellow-400 text-black shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                    : "border-transparent text-black"
                }`}
              >
                <Icon size={18} strokeWidth={2.5} />
                <span className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
