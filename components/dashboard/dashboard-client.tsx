"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Database,
  Gauge,
  Link2,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { VALUECHAIN_MAINNET } from "@/lib/valuechain";
import type { AiSignal, DashboardSnapshot, OrderIntent } from "@/lib/whalemind-types";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

function money(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 10_000 ? 2 : 4,
  }).format(value);
}

function compact(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "n/a";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function pct(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function shortAddress(address?: string) {
  if (!address) return "Connect wallet";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTime(value?: string) {
  if (!value) return "n/a";
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

async function switchToValueChain(provider: EthereumProvider) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: VALUECHAIN_MAINNET.hexChainId }],
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? Number(error.code) : undefined;
    if (code !== 4902) throw error;

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: VALUECHAIN_MAINNET.hexChainId,
          chainName: VALUECHAIN_MAINNET.chainName,
          nativeCurrency: VALUECHAIN_MAINNET.nativeCurrency,
          rpcUrls: [VALUECHAIN_MAINNET.rpcUrl],
          blockExplorerUrls: [VALUECHAIN_MAINNET.explorerUrl],
        },
      ],
    });
  }
}

function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border border-foreground/10 bg-foreground/[0.025] p-6 lg:p-8", className)}>
      {children}
    </section>
  );
}

function SectionTitle({
  eyebrow,
  title,
  right,
}: {
  eyebrow: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <div className="mb-2 flex items-center gap-3 text-xs font-mono text-muted-foreground">
          <span className="h-px w-8 bg-foreground/25" />
          {eyebrow}
        </div>
        <h2 className="font-display text-3xl tracking-tight lg:text-4xl">{title}</h2>
      </div>
      {right}
    </div>
  );
}

function EmptyBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="border border-dashed border-foreground/10 p-8 text-center">
      <AlertCircle className="mx-auto mb-4 h-6 w-6 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 border px-3 py-1 text-xs font-mono",
        ok ? "border-[#eca8d6]/30 bg-[#eca8d6]/10 text-[#eca8d6]" : "border-foreground/10 text-muted-foreground"
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-[#eca8d6]" : "bg-muted-foreground")} />
      {label}
    </span>
  );
}

function SignalTone({ signal }: { signal?: AiSignal }) {
  const tone =
    signal?.action === "BUY"
      ? "text-[#eca8d6]"
      : signal?.action === "SELL"
        ? "text-red-300"
        : signal?.action === "HOLD"
          ? "text-white"
          : "text-muted-foreground";

  return <span className={tone}>{signal?.action ?? "NO SIGNAL"}</span>;
}

export function DashboardClient() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [wallet, setWallet] = useState<string>();
  const [status, setStatus] = useState("Connect wallet to enter");
  const [isLoading, setIsLoading] = useState(true);
  const [isWalletBusy, setIsWalletBusy] = useState(false);
  const [isOrderBusy, setIsOrderBusy] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<string>();
  const [notionalUsd, setNotionalUsd] = useState("250");
  const [accountId, setAccountId] = useState("");
  const [intent, setIntent] = useState<OrderIntent | null>(null);

  const refresh = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const data = (await response.json()) as DashboardSnapshot;
      if (!response.ok || "error" in data) throw new Error("Unable to load live dashboard");
      setSnapshot(data);
      setSelectedAsset((current) => current ?? data.signals[0]?.asset ?? data.assets[0]?.symbol);
      setStatus(data.state === "live" ? "Live dashboard synced" : "Dashboard synced with source warnings");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Dashboard sync failed");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;

    provider
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const [first] = accounts as string[];
        if (first) {
          setWallet(first);
          setStatus("Wallet session restored");
        }
      })
      .catch(() => undefined);
  }, []);

  const topSignal = snapshot?.signals[0];
  const selectedSignal = useMemo(() => {
    return snapshot?.signals.find((signal) => signal.asset === selectedAsset) ?? topSignal;
  }, [selectedAsset, snapshot?.signals, topSignal]);
  const selectedMarket = snapshot?.assets.find((asset) => asset.symbol === selectedSignal?.asset);
  const hasWallet = Boolean(wallet);

  const connectWallet = async () => {
    setIsWalletBusy(true);
    try {
      const provider = window.ethereum;
      if (!provider) {
        setStatus("Install MetaMask or another EVM wallet to log in");
        return;
      }

      await switchToValueChain(provider);
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts[0]) throw new Error("No wallet account returned");
      setWallet(accounts[0]);
      setStatus("Logged in with wallet");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Wallet connection rejected");
    } finally {
      setIsWalletBusy(false);
    }
  };

  const createOrderIntent = async () => {
    if (!wallet) {
      setStatus("Connect wallet before creating an order intent");
      return;
    }
    if (!selectedSignal || !snapshot?.sodex) {
      setStatus("Live signal or SoDEX market data is not available");
      return;
    }

    setIsOrderBusy(true);
    setIntent(null);
    try {
      const response = await fetch("/api/sodex/order-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: wallet,
          accountId: accountId ? Number(accountId) : undefined,
          symbol: snapshot.sodex.symbol,
          side: selectedSignal.action === "SELL" ? "SELL" : "BUY",
          notionalUsd: Number(notionalUsd),
          orderType: "MARKET",
        }),
      });
      const data = (await response.json()) as Partial<OrderIntent> & { detail?: string };
      if (!response.ok || data.detail) throw new Error(data.detail ?? "Order intent failed");
      setIntent(data as OrderIntent);
      setStatus(data.executionMode === "dry-run" ? "Dry-run intent created; final SoDEX config missing" : "SoDEX intent ready for signature");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Order intent failed");
    } finally {
      setIsOrderBusy(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(236,168,214,0.12),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(103,232,249,0.08),transparent_28%)]" />
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
      </div>

      <header className="fixed left-4 right-4 top-4 z-50">
        <nav className="mx-auto flex h-14 max-w-[1400px] items-center justify-between border border-foreground/10 bg-background/80 px-5 backdrop-blur-xl">
          <a href="/" className="flex items-center gap-3">
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            <span className="font-display text-xl tracking-tight">WhaleMind</span>
            <span className="font-mono text-[10px] text-muted-foreground">AI</span>
          </a>

          <div className="hidden items-center gap-3 md:flex">
            <StatusPill ok={snapshot?.state === "live"} label={snapshot?.state ?? "sync"} />
            <span className="font-mono text-xs text-muted-foreground">{snapshot ? formatTime(snapshot.generatedAt) : "syncing"}</span>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={isLoading}
              className="rounded-full border-foreground/20 bg-transparent"
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={connectWallet}
              disabled={isWalletBusy}
              className="rounded-full bg-foreground px-4 text-background hover:bg-foreground/90"
            >
              {isWalletBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              {shortAddress(wallet)}
            </Button>
          </div>
        </nav>
      </header>

      <div className="relative z-10 mx-auto max-w-[1400px] px-6 pb-16 pt-28 lg:px-12">
        {!hasWallet ? (
          <section className="grid min-h-[calc(100vh-8rem)] items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="mb-6 inline-flex items-center gap-3 text-sm font-mono text-muted-foreground">
                <span className="h-px w-12 bg-foreground/25" />
                Wallet login
              </div>
              <h1 className="max-w-4xl font-display text-6xl leading-[0.9] tracking-tight md:text-7xl lg:text-[120px]">
                Connect.
                <br />
                <span className="text-muted-foreground">Enter the desk.</span>
              </h1>
              <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground">
                {snapshot?.aiBrief ?? "Live dashboard data is syncing from SoSoValue, SoDEX, and ValueChain."}
              </p>

              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <Button
                  type="button"
                  onClick={connectWallet}
                  disabled={isWalletBusy}
                  className="h-14 rounded-full bg-foreground px-8 text-base text-background hover:bg-foreground/90"
                >
                  {isWalletBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                  Connect wallet
                </Button>
                <Button asChild variant="outline" className="h-14 rounded-full border-foreground/20 bg-transparent px-8 text-base">
                  <a href="/">Back to site</a>
                </Button>
              </div>

              <div className="mt-10 flex flex-wrap gap-3">
                <StatusPill ok={Boolean(snapshot?.assets.length)} label="SoSoValue" />
                <StatusPill ok={Boolean(snapshot?.sodex)} label="SoDEX" />
                <StatusPill ok={Boolean(snapshot?.chain?.isLive)} label="ValueChain" />
                <StatusPill ok={Boolean(snapshot?.config.openaiApi)} label="OpenAI" />
                <StatusPill ok={Boolean(snapshot?.config.mongodb)} label="MongoDB" />
              </div>
            </div>

            <div className="relative min-h-[520px] overflow-hidden border border-foreground/10 bg-black">
              <img src="/images/whale.png" alt="WhaleMind whale" className="absolute inset-0 h-full w-full object-contain opacity-80" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-8">
                <div className="mb-2 text-xs font-mono text-white/50">Live source status</div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["Assets", snapshot?.assets.length ?? 0],
                    ["Signals", snapshot?.signals.length ?? 0],
                    ["ETF flows", snapshot?.etfFlows.length ?? 0],
                    ["News", snapshot?.news.length ?? 0],
                  ].map(([label, value]) => (
                    <div key={label} className="border border-white/10 bg-white/[0.03] p-4">
                      <div className="font-display text-3xl text-white">{value}</div>
                      <div className="text-xs text-white/45">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : (
          <div className="space-y-6 lg:space-y-8">
            <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
              <Panel className="relative min-h-[360px] overflow-hidden bg-black">
                <img src="/images/whale.png" alt="" aria-hidden="true" className="absolute bottom-0 right-0 h-full w-1/2 object-contain opacity-25" />
                <div className="relative z-10">
                  <div className="mb-8 flex flex-wrap items-center gap-3">
                    <StatusPill ok={snapshot?.state === "live"} label={snapshot?.state ?? "sync"} />
                    <span className="font-mono text-xs text-muted-foreground">{status}</span>
                  </div>
                  <h1 className="max-w-3xl font-display text-6xl leading-[0.9] tracking-tight md:text-7xl lg:text-[108px]">
                    Live market
                    <br />
                    <span className="text-muted-foreground">command.</span>
                  </h1>
                  <p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                    {snapshot?.aiBrief ?? "Waiting for live market brief."}
                  </p>
                </div>
              </Panel>

              <Panel>
                <SectionTitle eyebrow="Session" title="Wallet login" />
                <div className="space-y-5">
                  <div>
                    <div className="text-xs font-mono text-muted-foreground">Connected wallet</div>
                    <div className="mt-2 break-all font-mono text-sm">{wallet}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border border-foreground/10 p-4">
                      <div className="text-xs text-muted-foreground">Chain</div>
                      <div className="mt-2 font-display text-2xl">{snapshot?.chain?.chainId ?? "n/a"}</div>
                    </div>
                    <div className="border border-foreground/10 p-4">
                      <div className="text-xs text-muted-foreground">Block</div>
                      <div className="mt-2 font-display text-2xl">{snapshot?.chain?.blockNumber ?? "n/a"}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill ok={Boolean(snapshot?.config.sodexAccountId)} label="SoDEX account" />
                    <StatusPill ok={Boolean(snapshot?.config.sodexVerifyingContract)} label="EIP-712 contract" />
                    <StatusPill ok={Boolean(snapshot?.config.sodexLiveExecution)} label="Live execution" />
                  </div>
                </div>
              </Panel>
            </section>

            <section className="grid gap-6 lg:grid-cols-4">
              <Panel>
                <Gauge className="mb-5 h-5 w-5 text-[#eca8d6]" />
                <div className="text-xs font-mono text-muted-foreground">Top signal</div>
                <div className="mt-2 font-display text-4xl">
                  <SignalTone signal={topSignal} />
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {topSignal ? `${topSignal.asset} / ${topSignal.confidence}%` : "No live signal"}
                </div>
              </Panel>
              <Panel>
                <Activity className="mb-5 h-5 w-5 text-[#eca8d6]" />
                <div className="text-xs font-mono text-muted-foreground">SoDEX route</div>
                <div className="mt-2 font-display text-4xl">{snapshot?.sodex?.symbol ?? "n/a"}</div>
                <div className="mt-2 text-sm text-muted-foreground">{money(snapshot?.sodex?.lastPrice)}</div>
              </Panel>
              <Panel>
                <Database className="mb-5 h-5 w-5 text-[#eca8d6]" />
                <div className="text-xs font-mono text-muted-foreground">SoSoValue assets</div>
                <div className="mt-2 font-display text-4xl">{snapshot?.assets.length ?? 0}</div>
                <div className="mt-2 text-sm text-muted-foreground">live market snapshots</div>
              </Panel>
              <Panel>
                <ShieldCheck className="mb-5 h-5 w-5 text-[#eca8d6]" />
                <div className="text-xs font-mono text-muted-foreground">Execution mode</div>
                <div className="mt-2 font-display text-4xl">{snapshot?.config.sodexLiveExecution ? "LIVE" : "GUARD"}</div>
                <div className="mt-2 text-sm text-muted-foreground">wallet signature required</div>
              </Panel>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <Panel>
                <SectionTitle eyebrow="Signals" title="AI signal board" />
                {snapshot?.signals.length ? (
                  <div className="space-y-3">
                    {snapshot.signals.map((signal) => (
                      <button
                        key={signal.id}
                        type="button"
                        onClick={() => setSelectedAsset(signal.asset)}
                        className={cn(
                          "w-full border p-5 text-left transition-all hover:border-foreground/30 hover:bg-foreground/[0.03]",
                          selectedSignal?.asset === signal.asset ? "border-[#eca8d6]/50 bg-[#eca8d6]/5" : "border-foreground/10"
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <div className="text-xs font-mono text-muted-foreground">{signal.asset}</div>
                            <div className="mt-2 font-display text-3xl">
                              <SignalTone signal={signal} />
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-display text-3xl">{signal.confidence}%</div>
                            <Badge variant="outline" className="mt-2 border-foreground/10 font-mono uppercase">
                              {signal.risk} risk
                            </Badge>
                          </div>
                        </div>
                        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{signal.thesis}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {signal.drivers.map((driver) => (
                            <span key={driver} className="border border-foreground/10 px-2 py-1 text-xs text-muted-foreground">
                              {driver}
                            </span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyBlock title="No live signals yet" detail="Signals appear after SoSoValue market snapshots load." />
                )}
              </Panel>

              <Panel>
                <SectionTitle eyebrow="Execution" title="SoDEX intent" />
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-2 block text-xs font-mono text-muted-foreground">Notional USD</label>
                      <Input value={notionalUsd} onChange={(event) => setNotionalUsd(event.target.value)} inputMode="decimal" />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-mono text-muted-foreground">SoDEX account ID</label>
                      <Input value={accountId} onChange={(event) => setAccountId(event.target.value)} inputMode="numeric" placeholder="env or account" />
                    </div>
                  </div>
                  <div className="border border-foreground/10 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">Selected setup</span>
                      <span className="font-mono text-sm">{selectedSignal?.asset ?? "n/a"}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">Live price</span>
                      <span className="font-mono text-sm">{money(selectedMarket?.price)}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">Route</span>
                      <span className="font-mono text-sm">{snapshot?.sodex?.symbol ?? "n/a"}</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    onClick={createOrderIntent}
                    disabled={isOrderBusy || !snapshot?.sodex || !selectedSignal}
                    className="h-12 w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
                  >
                    {isOrderBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    Create SoDEX intent
                  </Button>
                  {intent ? (
                    <div className="border border-[#eca8d6]/20 bg-[#eca8d6]/5 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm text-[#eca8d6]">
                        <Check className="h-4 w-4" />
                        {intent.executionMode === "dry-run" ? "Dry-run intent" : "Ready for signature"}
                      </div>
                      <div className="space-y-2 font-mono text-xs text-muted-foreground">
                        <div>id: {intent.clOrdID}</div>
                        <div className="break-all">hash: {intent.payloadHash}</div>
                        <div>nonce: {intent.nonce}</div>
                      </div>
                      {intent.warnings.length > 0 && (
                        <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
                          {intent.warnings.map((warning) => (
                            <li key={warning} className="flex gap-2">
                              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>{warning}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>
              </Panel>
            </section>

            <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <Panel>
                <SectionTitle eyebrow="Markets" title="SoSoValue tape" />
                {snapshot?.assets.length ? (
                  <div className="space-y-3">
                    {snapshot.assets.map((asset) => (
                      <div key={asset.symbol} className="grid grid-cols-[0.6fr_1fr_1fr] items-center gap-4 border-b border-foreground/10 py-4 last:border-b-0">
                        <div>
                          <div className="font-medium">{asset.symbol}</div>
                          <div className="text-xs text-muted-foreground">{asset.name}</div>
                        </div>
                        <div className="text-right font-mono text-sm">{money(asset.price)}</div>
                        <div className={cn("text-right font-mono text-sm", asset.change24h >= 0 ? "text-[#eca8d6]" : "text-red-300")}>
                          {pct(asset.change24h)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyBlock title="No market snapshots" detail="SoSoValue did not return asset data for this refresh." />
                )}
              </Panel>

              <Panel>
                <SectionTitle eyebrow="ETF Flow" title="Institutional pressure" />
                {snapshot?.etfFlows.length ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {snapshot.etfFlows.map((flow) => (
                      <div key={flow.symbol} className="border border-foreground/10 p-5">
                        <div className="mb-4 flex items-center justify-between gap-4">
                          <span className="font-display text-3xl">{flow.symbol}</span>
                          <span className="font-mono text-xs text-muted-foreground">{flow.latestDate}</span>
                        </div>
                        <div className={cn("font-display text-4xl", flow.netInflow >= 0 ? "text-[#eca8d6]" : "text-red-300")}>
                          {money(flow.netInflow)}
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                          <div>
                            <span className="block text-xs">Cumulative</span>
                            {compact(flow.cumulativeInflow)}
                          </div>
                          <div>
                            <span className="block text-xs">Assets</span>
                            {compact(flow.totalAssets)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyBlock title="No ETF flow" detail="SoSoValue ETF flow did not return data for this refresh." />
                )}
              </Panel>
            </section>

            <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <Panel>
                <SectionTitle eyebrow="SoDEX Prints" title="Whale activity" />
                {snapshot?.whaleEvents.length ? (
                  <div className="space-y-4">
                    {snapshot.whaleEvents.map((event) => (
                      <div key={event.id} className="border border-foreground/10 p-5">
                        <div className="mb-3 flex items-start justify-between gap-4">
                          <div>
                            <div className="font-display text-3xl">{event.asset}</div>
                            <div className="text-xs font-mono text-muted-foreground">{event.direction}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-display text-3xl">{money(event.notionalUsd)}</div>
                            <div className="text-xs text-muted-foreground">{event.confidence}% confidence</div>
                          </div>
                        </div>
                        <p className="text-sm leading-relaxed text-muted-foreground">{event.summary}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyBlock title="No large prints in this poll" detail="The live SoDEX trade tape returned no whale-sized events for the selected route." />
                )}
              </Panel>

              <Panel>
                <SectionTitle eyebrow="News" title="SoSoValue hot feed" />
                {snapshot?.news.length ? (
                  <div className="space-y-3">
                    {snapshot.news.slice(0, 8).map((item) => (
                      <a
                        key={item.id}
                        href={item.sourceUrl ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-start justify-between gap-4 border-b border-foreground/10 py-4 last:border-b-0"
                      >
                        <span className="text-sm leading-relaxed text-muted-foreground transition-colors group-hover:text-foreground">
                          {item.title}
                        </span>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <EmptyBlock title="No hot news" detail="SoSoValue news did not return data for this refresh." />
                )}
              </Panel>
            </section>

            <Panel>
              <SectionTitle eyebrow="Readiness" title="Wave 1 source checks" />
              <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
                <StatusPill ok={Boolean(snapshot?.config.sosovalueApi)} label="SoSoValue key" />
                <StatusPill ok={Boolean(snapshot?.config.openaiApi)} label="OpenAI key" />
                <StatusPill ok={Boolean(snapshot?.config.mongodb)} label="MongoDB URI" />
                <StatusPill ok={Boolean(snapshot?.config.sodexAccountId)} label="SoDEX account" />
                <StatusPill ok={Boolean(snapshot?.config.sodexVerifyingContract)} label="SoDEX contract" />
                <StatusPill ok={Boolean(snapshot?.chain?.isLive)} label="ValueChain RPC" />
              </div>
              {snapshot?.sourceNotes.length ? (
                <div className="mt-6 space-y-2 text-sm text-muted-foreground">
                  {snapshot.sourceNotes.map((note) => (
                    <div key={note} className="flex gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{note}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </Panel>
          </div>
        )}
      </div>
    </main>
  );
}
