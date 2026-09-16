"use client";

import { useEffect, useState } from "react";
import { api, ApiClientError } from "@/lib/api-client";
import type { AccountBalance, BinanceAccount } from "@/lib/types";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatUsd } from "@/lib/utils";
import { Trash2, ShieldAlert, Wallet, KeyRound, Plus, ServerCrash } from "lucide-react";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<BinanceAccount[] | null>(null);
  const [balances, setBalances] = useState<Record<string, AccountBalance>>({});
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const list = await api.listAccounts();
      setAccounts(list);
      list.forEach((a) => {
        api.getAccountBalance(a.id).then((b) => {
          setBalances((prev) => ({ ...prev, [a.id]: b }));
        }).catch(() => undefined);
      });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load accounts");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Disconnect this account? Any bots using it will stop working.")) return;
    await api.deleteAccount(id);
    refresh();
  }

  return (
    <div className="flex flex-col gap-8 font-sans bg-white min-h-screen">
      {/* Page Header */}
      <div className="flex items-center gap-4 border-b-4 border-black pb-4">
        <Wallet className="text-black" size={32} strokeWidth={2.5} />
        <div>
          <h1 className="text-3xl font-black text-black uppercase tracking-tight">Accounts</h1>
          <p className="text-sm font-bold text-black mt-1 uppercase bg-yellow-200 inline-block px-2 border-2 border-black">
            Connect & manage Binance Spot API keys
          </p>
        </div>
      </div>

      {/* Security Warning Notice */}
      <Panel className="border-4 border-black bg-yellow-300 rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)]">
        <PanelBody className="flex items-start gap-4 p-5">
          <ShieldAlert size={28} strokeWidth={2.5} className="mt-0.5 shrink-0 text-black" />
          <div className="text-sm font-bold text-black uppercase leading-relaxed">
            Create an API key with <span className="bg-white border-2 border-black px-1.5 py-0.5 font-black">Reading</span> and{" "}
            <span className="bg-white border-2 border-black px-1.5 py-0.5 font-black">Spot &amp; Margin Trading</span> permissions only.
            <div className="mt-2 bg-red-400 text-black font-black border-2 border-black p-2 inline-block">
              ⚠️ DO NOT ENABLE WITHDRAWALS — Live bots will refuse to run on keys with withdrawal permissions enabled.
            </div>
          </div>
        </PanelBody>
      </Panel>

      {/* Accounts List Table */}
      <Panel className="border-4 border-black bg-white rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)]">
        <PanelHeader className="border-b-4 border-black px-5 py-4 bg-cyan-300">
          <PanelTitle className="text-black font-black uppercase tracking-widest flex items-center gap-2">
            <KeyRound size={20} strokeWidth={2.5} /> Connected API Keys
          </PanelTitle>
        </PanelHeader>
        <PanelBody className="p-0">
          {error && (
            <div className="border-b-4 border-black bg-red-400 px-5 py-3 text-sm font-black text-black uppercase">
              CRITICAL ERROR: {error}
            </div>
          )}
          {accounts === null ? (
            <div className="px-5 py-16 text-center text-lg font-black uppercase text-black animate-pulse bg-gray-50">
              Loading API Connections...
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-5 py-16 text-center bg-gray-50">
              <ServerCrash size={48} strokeWidth={2} className="text-black mb-4" />
              <div className="text-lg font-black uppercase text-black">No Accounts Connected</div>
              <div className="text-sm font-bold text-gray-500 mt-1 uppercase">Add a Binance Spot API key below to start trading.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-4 border-black text-left text-xs font-black uppercase tracking-widest text-black bg-gray-200">
                    <th className="px-5 py-4 whitespace-nowrap">Label</th>
                    <th className="px-5 py-4 whitespace-nowrap">API Key</th>
                    <th className="px-5 py-4 whitespace-nowrap">Permissions</th>
                    <th className="px-5 py-4 whitespace-nowrap">Balance (USDT Est.)</th>
                    <th className="px-5 py-4 whitespace-nowrap">Verified</th>
                    <th className="px-5 py-4 whitespace-nowrap text-right">Disconnect</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-black">
                  {accounts.map((a) => (
                    <tr key={a.id} className="hover:bg-yellow-100 transition-none bg-white">
                      <td className="px-5 py-4 font-black text-black uppercase">{a.label}</td>
                      <td className="px-5 py-4 font-mono font-bold text-black tabular-nums">
                        {a.api_key.slice(0, 6)}…{a.api_key.slice(-4)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <Badge tone={a.can_trade ? "up" : "muted"} className="border-2 border-black rounded-none uppercase font-black bg-white shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                            Trade {a.can_trade ? "✓" : "✗"}
                          </Badge>
                          <Badge
                            tone={a.can_withdraw ? "down" : "up"}
                            className={`border-2 border-black rounded-none uppercase font-black shadow-[2px_2px_0px_rgba(0,0,0,1)] ${
                              a.can_withdraw ? "bg-red-400 text-black" : "bg-green-400 text-black"
                            }`}
                          >
                            Withdraw {a.can_withdraw ? "ENABLED (UNSAFE)" : "OFF"}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-black text-black tabular-nums">
                        {balances[a.id]?.error ? (
                          <span className="text-xs font-bold text-red-600 uppercase">{balances[a.id]?.error}</span>
                        ) : balances[a.id] ? (
                          <span className="text-base">{formatUsd(balances[a.id]?.total_usdt_value)}</span>
                        ) : (
                          <span className="text-gray-400 animate-pulse">Fetching…</span>
                        )}
                      </td>
                      <td className="px-5 py-4 font-bold text-black uppercase tabular-nums">
                        {formatDateTime(a.last_verified_at)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => handleDelete(a.id)}
                          className="p-2 border-2 border-black bg-red-500 text-white hover:bg-black transition-none shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                          aria-label="Disconnect"
                          title="Disconnect Account"
                        >
                          <Trash2 size={16} strokeWidth={2.5} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PanelBody>
      </Panel>

      {/* Connect Account Form */}
      <ConnectAccountForm onConnected={refresh} />
    </div>
  );
}

function ConnectAccountForm({ onConnected }: { onConnected: () => void }) {
  const [label, setLabel] = useState("Binance Account");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.connectAccount({ label, api_key: apiKey, api_secret: apiSecret });
      setApiKey("");
      setApiSecret("");
      onConnected();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not connect account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel className="border-4 border-black bg-white rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)]">
      <PanelHeader className="border-b-4 border-black bg-green-400 px-5 py-4">
        <PanelTitle className="text-black font-black uppercase tracking-widest flex items-center gap-2">
          <Plus size={20} strokeWidth={2.5} /> Connect New API Account
        </PanelTitle>
      </PanelHeader>
      <PanelBody className="bg-gray-50 p-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 md:max-w-md">
          <Field label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="API Key">
            <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} required autoComplete="off" />
          </Field>
          <Field label="API Secret" hint="Encrypted before storage. Secrets are never displayed after submit.">
            <Input type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} required autoComplete="off" />
          </Field>

          {error && (
            <p className="text-sm font-black uppercase text-red-600 bg-red-100 p-3 border-2 border-red-600">
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" disabled={loading} className="self-start mt-2">
            {loading ? "Verifying with Binance…" : "Connect Account"}
          </Button>
        </form>
      </PanelBody>
    </Panel>
  );
}
