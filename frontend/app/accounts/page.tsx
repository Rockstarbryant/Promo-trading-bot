"use client";

import { useEffect, useState } from "react";
import { api, ApiClientError } from "@/lib/api-client";
import type { AccountBalance, BinanceAccount, Withdrawal } from "@/lib/types";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Badge, statusTone } from "@/components/ui/badge";
import { formatDateTime, formatNumber, formatUsd } from "@/lib/utils";
import { Trash2, ShieldAlert, Wallet, KeyRound, Plus, ServerCrash, ArrowUpFromLine, X } from "lucide-react";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<BinanceAccount[] | null>(null);
  const [balances, setBalances] = useState<Record<string, AccountBalance>>({});
  const [error, setError] = useState<string | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<BinanceAccount | null>(null);

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

  async function handleToggleWithdrawalEnabled(account: BinanceAccount) {
    const next = !account.withdrawal_enabled;
    if (next && !confirm(
      "Enable API withdrawals for this account? Funds could be sent out through " +
      "this app's API whenever you (or anything holding this account's session) " +
      "submits a withdrawal request. Binance's own address whitelist and 2FA " +
      "settings still apply."
    )) return;
    try {
      await api.setWithdrawalEnabled(account.id, next);
      refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update withdrawal setting");
    }
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
            <span className="bg-white border-2 border-black px-1.5 py-0.5 font-black">Spot &amp; Margin Trading</span> permissions.
            <div className="mt-2 bg-red-400 text-black font-black border-2 border-black p-2 inline-block">
              ⚠️ Only add withdrawal permission on the key if you intend to withdraw through this app.
              Withdrawals are off by default and must be explicitly enabled per account below —
              set a Binance address whitelist first. The automated trading bots can never trigger a withdrawal.
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
                    <th className="px-5 py-4 whitespace-nowrap">API Withdrawals</th>
                    <th className="px-5 py-4 whitespace-nowrap text-right">Actions</th>
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
                            tone={a.can_withdraw ? "signal" : "muted"}
                            className="border-2 border-black rounded-none uppercase font-black shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                          >
                            Key Withdraw {a.can_withdraw ? "✓" : "✗"}
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
                      <td className="px-5 py-4">
                        <button
                          onClick={() => handleToggleWithdrawalEnabled(a)}
                          disabled={!a.can_withdraw}
                          title={!a.can_withdraw ? "Connected key has no withdrawal permission on Binance" : undefined}
                          className={`px-2 py-1 border-2 border-black text-xs font-black uppercase shadow-[2px_2px_0px_rgba(0,0,0,1)] disabled:opacity-40 disabled:cursor-not-allowed ${
                            a.withdrawal_enabled ? "bg-green-400 text-black" : "bg-gray-200 text-black"
                          }`}
                        >
                          {a.withdrawal_enabled ? "Enabled" : "Disabled"}
                        </button>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => setWithdrawTarget(a)}
                            disabled={!a.withdrawal_enabled}
                            className="p-2 border-2 border-black bg-cyan-300 text-black hover:bg-black hover:text-white transition-none shadow-[2px_2px_0px_rgba(0,0,0,1)] disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="Withdraw"
                            title={a.withdrawal_enabled ? "Withdraw" : "Enable API withdrawals first"}
                          >
                            <ArrowUpFromLine size={16} strokeWidth={2.5} />
                          </button>
                          <button
                            onClick={() => handleDelete(a.id)}
                            className="p-2 border-2 border-black bg-red-500 text-white hover:bg-black transition-none shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                            aria-label="Disconnect"
                            title="Disconnect Account"
                          >
                            <Trash2 size={16} strokeWidth={2.5} />
                          </button>
                        </div>
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

      {withdrawTarget && (
        <WithdrawModal
          account={withdrawTarget}
          onClose={() => setWithdrawTarget(null)}
        />
      )}
    </div>
  );
}

function WithdrawModal({ account, onClose }: { account: BinanceAccount; onClose: () => void }) {
  const [asset, setAsset] = useState("USDT");
  const [network, setNetwork] = useState("");
  const [address, setAddress] = useState("");
  const [addressTag, setAddressTag] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Withdrawal | null>(null);
  const [history, setHistory] = useState<Withdrawal[] | null>(null);

  useEffect(() => {
    api.listWithdrawals(account.id).then(setHistory).catch(() => setHistory([]));
  }, [account.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirm(`Send ${amount} ${asset} from "${account.label}" to ${address}? This cannot be undone.`)) return;
    setLoading(true);
    setError(null);
    try {
      const w = await api.createWithdrawal(account.id, {
        asset, address, amount,
        network: network || undefined,
        address_tag: addressTag || undefined,
      });
      setSubmitted(w);
      setHistory((prev) => (prev ? [w, ...prev] : [w]));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not submit withdrawal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Panel className="border-4 border-black bg-white rounded-none shadow-[8px_8px_0px_rgba(0,0,0,1)] w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <PanelHeader className="border-b-4 border-black bg-cyan-300 px-5 py-4 flex items-center justify-between">
          <PanelTitle className="text-black font-black uppercase tracking-widest flex items-center gap-2">
            <ArrowUpFromLine size={20} strokeWidth={2.5} /> Withdraw — {account.label}
          </PanelTitle>
          <button onClick={onClose} aria-label="Close" className="p-1 border-2 border-black bg-white hover:bg-black hover:text-white">
            <X size={16} strokeWidth={2.5} />
          </button>
        </PanelHeader>
        <PanelBody className="bg-gray-50 p-5 flex flex-col gap-5">
          {submitted ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-black uppercase text-black bg-green-300 border-2 border-black p-3">
                Withdrawal submitted to Binance. Status: {submitted.status}
                {submitted.binance_withdraw_id ? ` (id ${submitted.binance_withdraw_id})` : ""}.
              </p>
              <Button type="button" variant="secondary" onClick={() => setSubmitted(null)}>
                Submit another
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Field label="Asset">
                <Input value={asset} onChange={(e) => setAsset(e.target.value.toUpperCase())} required />
              </Field>
              <Field label="Network" hint="Optional — leave blank to use the asset's default network">
                <Input value={network} onChange={(e) => setNetwork(e.target.value)} placeholder="e.g. TRC20, BSC" />
              </Field>
              <Field label="Destination address">
                <Input value={address} onChange={(e) => setAddress(e.target.value)} required autoComplete="off" />
              </Field>
              <Field label="Address tag / memo" hint="Only required for assets that use one (e.g. XRP, XLM)">
                <Input value={addressTag} onChange={(e) => setAddressTag(e.target.value)} />
              </Field>
              <Field label="Amount">
                <Input type="number" step="any" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </Field>

              {error && (
                <p className="text-sm font-black uppercase text-red-600 bg-red-100 p-3 border-2 border-red-600">
                  {error}
                </p>
              )}

              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? "Submitting…" : "Submit withdrawal"}
              </Button>
            </form>
          )}

          <div className="border-t-2 border-black pt-4">
            <div className="text-xs font-black uppercase tracking-widest text-black mb-2">Recent withdrawals</div>
            {history === null ? (
              <div className="text-xs font-bold uppercase text-gray-400">Loading…</div>
            ) : history.length === 0 ? (
              <div className="text-xs font-bold uppercase text-gray-400">None yet</div>
            ) : (
              <div className="flex flex-col gap-2">
                {history.slice(0, 5).map((w) => (
                  <div key={w.id} className="flex items-center justify-between text-xs font-bold uppercase border-2 border-black bg-white px-2 py-1.5">
                    <span>{formatNumber(w.amount, 6)} {w.asset} → {w.address.slice(0, 6)}…{w.address.slice(-4)}</span>
                    <Badge tone={statusTone(w.status)} className="border-2 border-black rounded-none">{w.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </PanelBody>
      </Panel>
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
