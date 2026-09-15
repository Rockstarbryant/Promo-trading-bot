"use client";

import { useEffect, useState } from "react";
import { api, ApiClientError } from "@/lib/api-client";
import type { AccountBalance, BinanceAccount } from "@/lib/types";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatUsd } from "@/lib/utils";
import { Trash2, ShieldAlert } from "lucide-react";

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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ash-50">Accounts</h1>
        <p className="text-sm text-ash-400">Connect a Binance Spot API key. Never enable withdrawal permission for this application.</p>
      </div>

      <Panel className="border-signal/30 bg-signal/5">
        <PanelBody className="flex items-start gap-3">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-signal" />
          <p className="text-sm text-ash-200">
            Create an API key with <strong className="text-ash-50">Reading</strong> and{" "}
            <strong className="text-ash-50">Spot &amp; Margin Trading</strong> permission only.
            Do not enable withdrawals — this app has no withdrawal capability and will refuse
            to run a live bot on a key that has it enabled.
          </p>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader><PanelTitle>Connected accounts</PanelTitle></PanelHeader>
        <PanelBody className="p-0">
          {error && <p className="px-4 py-3 text-sm text-market-down">{error}</p>}
          {accounts === null ? (
            <div className="px-4 py-8 text-center text-sm text-ash-400">Loading…</div>
          ) : accounts.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ash-400">No accounts connected yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-600 text-left text-xs text-ash-400">
                  <th className="px-4 py-2 font-normal">Label</th>
                  <th className="px-4 py-2 font-normal">API key</th>
                  <th className="px-4 py-2 font-normal">Permissions</th>
                  <th className="px-4 py-2 font-normal">Balance (USDT est.)</th>
                  <th className="px-4 py-2 font-normal">Verified</th>
                  <th className="px-4 py-2 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b border-ink-600/60 last:border-0">
                    <td className="px-4 py-3 text-ash-50">{a.label}</td>
                    <td className="px-4 py-3 tabular text-ash-400">
                      {a.api_key.slice(0, 6)}…{a.api_key.slice(-4)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <Badge tone={a.can_trade ? "up" : "muted"}>Trade {a.can_trade ? "✓" : "✗"}</Badge>
                        <Badge tone={a.can_withdraw ? "down" : "up"}>
                          Withdraw {a.can_withdraw ? "enabled" : "off"}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular text-ash-50">
                      {balances[a.id]?.error ? (
                        <span className="text-xs text-ash-400">{balances[a.id]?.error}</span>
                      ) : balances[a.id] ? (
                        formatUsd(balances[a.id]?.total_usdt_value)
                      ) : (
                        <span className="text-ash-400">…</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular text-ash-400">{formatDateTime(a.last_verified_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleDelete(a.id)} className="text-ash-400 hover:text-market-down" aria-label="Disconnect">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PanelBody>
      </Panel>

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
    <Panel>
      <PanelHeader><PanelTitle>Connect a new account</PanelTitle></PanelHeader>
      <PanelBody>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 md:max-w-md">
          <Field label="Label"><Input value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
          <Field label="API key">
            <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} required autoComplete="off" />
          </Field>
          <Field label="API secret" hint="Encrypted before storage. Never shown again after this.">
            <Input type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} required autoComplete="off" />
          </Field>
          {error && <p className="text-sm text-market-down">{error}</p>}
          <Button type="submit" disabled={loading} className="self-start">
            {loading ? "Verifying with Binance…" : "Connect account"}
          </Button>
        </form>
      </PanelBody>
    </Panel>
  );
}
