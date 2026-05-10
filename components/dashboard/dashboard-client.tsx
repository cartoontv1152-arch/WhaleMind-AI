"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Link2,
  Loader2,
  Lock,
  RefreshCw,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
  if (value === undefined || Number.isNaN(value)) return "live data unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 10_000 ? 2 : 4,
  }).format(value);
}

function compact(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "unavailable";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function pct(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "unavailable";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function shortAddress(address?: string) {
  if (!address) return "Connect wallet";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTime(value?: string) {
  if (!value) return "syncing";
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function chartTime(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
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

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("border-b border-foreground/10 py-6", className)}>{children}</section>;
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

function SectionHeading({ label, title }: { label: string; title: string }) {
  return (
    <div className="mb-4">
      <div className="mb-2 text-xs font-mono uppercase text-muted-foreground">{label}</div>
      <h2 className="font-display text-2xl tracking-tight">{title}</h2>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-foreground/10 p-6 text-sm text-muted-foreground">
      <AlertCircle className="mb-3 h-5 w-5" />
      {text}
    </div>
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

  return <span className={tone}>{signal?.action ?? "NO LIVE SIGNAL"}</span>;
}

function ChartShell({ children, empty }: { children: React.ReactNode; empty: boolean }) {
  if (empty) {
    return <EmptyState text="Not enough live data returned yet to draw this chart." />;
  }

  return <div className="h-72 w-full">{children}</div>;
}

function LiveTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number }>; label?: string }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="border border-foreground/10 bg-background/95 p-3 text-xs shadow-xl">
      <div className="mb-2 font-mono text-muted-foreground">{label}</div>
      <div className="space-y-1">
        {payload.map((item) => (
          <div key={item.name} className="flex justify-between gap-5">
            <span>{item.name}</span>
            <span className="font-mono">{typeof item.value === "number" ? compact(item.value) : item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketCharts({
  assetLabel,
  priceHistory,
  assetChart,
  flowChart,
  whaleChart,
}: {
  assetLabel: string;
  priceHistory: Array<{ time: string; price: number; confidence: number | undefined }>;
  assetChart: Array<{ symbol: string; price: number; change: number; volume: number }>;
  flowChart: Array<{ symbol: string; netInflow: number; totalAssets: number }>;
  whaleChart: Array<{ asset: string; notional: number; confidence: number }>;
}) {
  return (
    <section className="grid gap-8 border-b border-foreground/10 py-6 xl:grid-cols-[1.2fr_0.8fr]">
      <div>
        <SectionHeading label="Live chart" title={`${assetLabel} price and confidence`} />
        <ChartShell empty={priceHistory.length === 0}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={priceHistory} margin={{ left: 0, right: 12, top: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#eca8d6" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#eca8d6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="price" tickFormatter={(value) => compact(Number(value))} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} width={54} />
              <YAxis yAxisId="confidence" orientation="right" domain={[0, 100]} tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} axisLine={false} tickLine={false} width={34} />
              <Tooltip content={<LiveTooltip />} />
              <Area yAxisId="price" type="monotone" dataKey="price" name="price" stroke="#eca8d6" fill="url(#priceFill)" strokeWidth={2} dot={priceHistory.length < 3} />
              <Area yAxisId="confidence" type="monotone" dataKey="confidence" name="confidence" stroke="#67e8f9" fill="transparent" strokeWidth={2} dot={priceHistory.length < 3} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartShell>
      </div>

      <div className="grid gap-8">
        <div>
          <SectionHeading label="Momentum" title="SoSoValue 24h move" />
          <ChartShell empty={assetChart.length === 0}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={assetChart} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="symbol" tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(value) => `${Number(value).toFixed(0)}%`} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} width={38} />
                <Tooltip content={<LiveTooltip />} />
                <Bar dataKey="change" name="24h change" fill="#eca8d6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartShell>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <SectionHeading label="ETF" title="Net flow" />
            <ChartShell empty={flowChart.length === 0}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={flowChart} margin={{ left: 0, right: 6, top: 10, bottom: 0 }}>
                  <XAxis dataKey="symbol" tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(value) => compact(Number(value))} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} width={46} />
                  <Tooltip content={<LiveTooltip />} />
                  <Bar dataKey="netInflow" name="net inflow" fill="#67e8f9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartShell>
          </div>
          <div>
            <SectionHeading label="SoDEX" title="Prints" />
            <ChartShell empty={whaleChart.length === 0}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={whaleChart} margin={{ left: 0, right: 6, top: 10, bottom: 0 }}>
                  <XAxis dataKey="asset" tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(value) => compact(Number(value))} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} width={46} />
                  <Tooltip content={<LiveTooltip />} />
                  <Bar dataKey="notional" name="notional" fill="#eca8d6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartShell>
          </div>
        </div>
      </div>
    </section>
  );
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
      const data = (await response.json()) as DashboardSnapshot & { error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? "Unable to load live dashboard");
      setSnapshot(data);
      setSelectedAsset((current) => current ?? data.signals[0]?.asset ?? data.assets[0]?.symbol);
      setStatus(data.state === "live" ? "Live data synced" : "Live data synced with source warnings");
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
  const priceHistory = useMemo(() => {
    const assetSymbol = selectedSignal?.asset ?? snapshot?.assets[0]?.symbol;
    if (!assetSymbol) return [];

    return (snapshot?.history ?? [])
      .map((point) => {
        const asset = point.assets.find((item) => item.symbol === assetSymbol);
        const signal = point.signals.find((item) => item.asset === assetSymbol);

        return {
          time: chartTime(point.generatedAt),
          price: asset?.price,
          confidence: signal?.confidence,
        };
      })
      .filter((point): point is { time: string; price: number; confidence: number | undefined } => typeof point.price === "number");
  }, [selectedSignal?.asset, snapshot?.assets, snapshot?.history]);
  const assetChart = useMemo(() => {
    return (snapshot?.assets ?? []).map((asset) => ({
      symbol: asset.symbol,
      price: asset.price,
      change: asset.change24h,
      volume: asset.volume24h,
    }));
  }, [snapshot?.assets]);
  const flowChart = useMemo(() => {
    return (snapshot?.etfFlows ?? []).map((flow) => ({
      symbol: flow.symbol,
      netInflow: flow.netInflow,
      totalAssets: flow.totalAssets,
    }));
  }, [snapshot?.etfFlows]);
  const whaleChart = useMemo(() => {
    return (snapshot?.whaleEvents ?? []).map((event) => ({
      asset: event.asset,
      notional: event.notionalUsd,
      confidence: event.confidence,
    }));
  }, [snapshot?.whaleEvents]);

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
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-foreground/10 bg-background/90 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5">
          <a href="/" className="flex items-center gap-3">
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            <span className="font-display text-xl tracking-tight">WhaleMind AI</span>
          </a>

          <div className="hidden items-center gap-3 md:flex">
            <StatusPill ok={snapshot?.state === "live"} label={snapshot?.state ?? "syncing"} />
            <span className="font-mono text-xs text-muted-foreground">{formatTime(snapshot?.generatedAt)}</span>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={isLoading} className="rounded-full border-foreground/20 bg-transparent">
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button type="button" size="sm" onClick={connectWallet} disabled={isWalletBusy} className="rounded-full bg-foreground px-4 text-background hover:bg-foreground/90">
              {isWalletBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              {shortAddress(wallet)}
            </Button>
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-[1280px] px-5 py-8">
        {!wallet ? (
          <section className="grid min-h-[calc(100vh-8rem)] items-center gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <Panel className="p-7 lg:p-10">
              <div className="mb-4 text-xs font-mono uppercase text-muted-foreground">Wallet login</div>
              <h1 className="font-display text-5xl leading-none tracking-tight md:text-7xl">Connect wallet</h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
                {snapshot?.aiBrief ?? "WhaleMind is waiting for live SoSoValue, SoDEX, and ValueChain data."}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button type="button" onClick={connectWallet} disabled={isWalletBusy} className="h-12 rounded-full bg-foreground px-7 text-background hover:bg-foreground/90">
                  {isWalletBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                  Connect wallet
                </Button>
                <Button asChild variant="outline" className="h-12 rounded-full border-foreground/20 bg-transparent px-7">
                  <a href="/">Back to site</a>
                </Button>
              </div>
            </Panel>

            <Panel>
              <SectionHeading label="Live sources" title="No dummy dashboard data" />
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Assets", snapshot?.assets.length ?? 0],
                  ["Signals", snapshot?.signals.length ?? 0],
                  ["ETF flows", snapshot?.etfFlows.length ?? 0],
                  ["News", snapshot?.news.length ?? 0],
                ].map(([label, value]) => (
                  <div key={label} className="border border-foreground/10 p-4">
                    <div className="font-display text-3xl">{value}</div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <StatusPill ok={Boolean(snapshot?.config.sosovalueApi)} label="SoSoValue" />
                <StatusPill ok={Boolean(snapshot?.sodex)} label="SoDEX" />
                <StatusPill ok={Boolean(snapshot?.chain?.isLive)} label="ValueChain" />
                <StatusPill ok={Boolean(snapshot?.config.openaiApi)} label="OpenAI" />
                <StatusPill ok={Boolean(snapshot?.config.mongodb)} label="MongoDB" />
              </div>
            </Panel>

            <div className="lg:col-span-2">
              <MarketCharts
                assetLabel={selectedSignal?.asset ?? snapshot?.assets[0]?.symbol ?? "Asset"}
                priceHistory={priceHistory}
                assetChart={assetChart}
                flowChart={flowChart}
                whaleChart={whaleChart}
              />
            </div>
          </section>
        ) : (
          <div className="space-y-5">
            <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
              <Panel className="p-7">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <StatusPill ok={snapshot?.state === "live"} label={snapshot?.state ?? "syncing"} />
                  <span className="font-mono text-xs text-muted-foreground">{status}</span>
                </div>
                <h1 className="font-display text-5xl leading-none tracking-tight md:text-7xl">Live dashboard</h1>
                <p className="mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground">
                  {snapshot?.aiBrief ?? "Waiting for live market brief."}
                </p>
              </Panel>

              <Panel>
                <SectionHeading label="Wallet" title={shortAddress(wallet)} />
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4 border-b border-foreground/10 pb-3">
                    <span className="text-muted-foreground">Chain</span>
                    <span className="font-mono">{snapshot?.chain?.chainId ?? "unavailable"}</span>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-foreground/10 pb-3">
                    <span className="text-muted-foreground">Block</span>
                    <span className="font-mono">{snapshot?.chain?.blockNumber ?? "unavailable"}</span>
                  </div>
                  <div className="break-all font-mono text-xs text-muted-foreground">{wallet}</div>
                </div>
              </Panel>
            </section>

            <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              <Panel>
                <div className="text-xs font-mono uppercase text-muted-foreground">Top signal</div>
                <div className="mt-2 font-display text-3xl"><SignalTone signal={topSignal} /></div>
                <div className="mt-2 text-sm text-muted-foreground">{topSignal ? `${topSignal.asset} / ${topSignal.confidence}% confidence` : "No live signal returned"}</div>
              </Panel>
              <Panel>
                <div className="text-xs font-mono uppercase text-muted-foreground">SoDEX route</div>
                <div className="mt-2 font-display text-3xl">{snapshot?.sodex?.symbol ?? "unavailable"}</div>
                <div className="mt-2 text-sm text-muted-foreground">{money(snapshot?.sodex?.lastPrice)}</div>
              </Panel>
              <Panel>
                <div className="text-xs font-mono uppercase text-muted-foreground">Live sources</div>
                <div className="mt-2 font-display text-3xl">{snapshot ? snapshot.assets.length + snapshot.etfFlows.length + snapshot.news.length : 0}</div>
                <div className="mt-2 text-sm text-muted-foreground">records this refresh</div>
              </Panel>
              <Panel>
                <div className="text-xs font-mono uppercase text-muted-foreground">Execution</div>
                <div className="mt-2 font-display text-3xl">{snapshot?.config.sodexLiveExecution ? "LIVE" : "DRY-RUN"}</div>
                <div className="mt-2 text-sm text-muted-foreground">wallet signature required</div>
              </Panel>
            </section>

            <MarketCharts
              assetLabel={selectedSignal?.asset ?? "Asset"}
              priceHistory={priceHistory}
              assetChart={assetChart}
              flowChart={flowChart}
              whaleChart={whaleChart}
            />

            <section className="grid gap-5 lg:grid-cols-[1fr_380px]">
              <Panel>
                <SectionHeading label="Signals" title="AI signal board" />
                {snapshot?.signals.length ? (
                  <div className="divide-y divide-foreground/10">
                    {snapshot.signals.map((signal) => (
                      <button
                        key={signal.id}
                        type="button"
                        onClick={() => setSelectedAsset(signal.asset)}
                        className={cn(
                          "grid w-full gap-3 py-4 text-left md:grid-cols-[120px_120px_1fr_90px]",
                          selectedSignal?.asset === signal.asset && "text-[#eca8d6]"
                        )}
                      >
                        <span className="font-display text-2xl">{signal.asset}</span>
                        <span className="font-mono text-sm"><SignalTone signal={signal} /></span>
                        <span className="text-sm text-muted-foreground">{signal.thesis}</span>
                        <Badge variant="outline" className="w-fit border-foreground/10 font-mono">{signal.confidence}%</Badge>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="No live signals returned by the current SoSoValue and SoDEX refresh." />
                )}
              </Panel>

              <Panel>
                <SectionHeading label="Execution" title="SoDEX intent" />
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-2 block text-xs font-mono text-muted-foreground">Notional USD</label>
                      <Input value={notionalUsd} onChange={(event) => setNotionalUsd(event.target.value)} inputMode="decimal" />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-mono text-muted-foreground">Account ID</label>
                      <Input value={accountId} onChange={(event) => setAccountId(event.target.value)} inputMode="numeric" placeholder="optional" />
                    </div>
                  </div>
                  <div className="space-y-2 border border-foreground/10 p-4 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Asset</span>
                      <span className="font-mono">{selectedSignal?.asset ?? "unavailable"}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Price</span>
                      <span className="font-mono">{money(selectedMarket?.price)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Route</span>
                      <span className="font-mono">{snapshot?.sodex?.symbol ?? "unavailable"}</span>
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

            <section className="grid gap-5 lg:grid-cols-2">
              <Panel>
                <SectionHeading label="Markets" title="SoSoValue assets" />
                {snapshot?.assets.length ? (
                  <div className="divide-y divide-foreground/10">
                    {snapshot.assets.map((asset) => (
                      <div key={asset.symbol} className="grid grid-cols-[80px_1fr_100px] items-center gap-4 py-3">
                        <div>
                          <div className="font-medium">{asset.symbol}</div>
                          <div className="text-xs text-muted-foreground">{asset.name}</div>
                        </div>
                        <div className="text-right font-mono text-sm">{money(asset.price)}</div>
                        <div className={cn("text-right font-mono text-sm", asset.change24h >= 0 ? "text-[#eca8d6]" : "text-red-300")}>{pct(asset.change24h)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="SoSoValue did not return live asset snapshots for this refresh." />
                )}
              </Panel>

              <Panel>
                <SectionHeading label="ETF flow" title="Institutional pressure" />
                {snapshot?.etfFlows.length ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {snapshot.etfFlows.map((flow) => (
                      <div key={flow.symbol} className="border border-foreground/10 p-4">
                        <div className="mb-3 flex items-center justify-between gap-4">
                          <span className="font-display text-2xl">{flow.symbol}</span>
                          <span className="font-mono text-xs text-muted-foreground">{flow.latestDate}</span>
                        </div>
                        <div className={cn("font-display text-3xl", flow.netInflow >= 0 ? "text-[#eca8d6]" : "text-red-300")}>{money(flow.netInflow)}</div>
                        <div className="mt-3 text-xs text-muted-foreground">Assets {compact(flow.totalAssets)} / cumulative {compact(flow.cumulativeInflow)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="SoSoValue did not return live ETF flow for this refresh." />
                )}
              </Panel>
            </section>

            <section className="grid gap-5 lg:grid-cols-2">
              <Panel>
                <SectionHeading label="SoDEX" title="Whale prints" />
                {snapshot?.whaleEvents.length ? (
                  <div className="divide-y divide-foreground/10">
                    {snapshot.whaleEvents.map((event) => (
                      <div key={event.id} className="py-4">
                        <div className="mb-2 flex items-start justify-between gap-4">
                          <div>
                            <div className="font-display text-2xl">{event.asset}</div>
                            <div className="text-xs font-mono text-muted-foreground">{event.direction}</div>
                          </div>
                          <div className="text-right font-mono text-sm">{money(event.notionalUsd)}</div>
                        </div>
                        <p className="text-sm leading-relaxed text-muted-foreground">{event.summary}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="The live SoDEX trade tape returned no whale-sized prints for this route." />
                )}
              </Panel>

              <Panel>
                <SectionHeading label="News" title="SoSoValue hot feed" />
                {snapshot?.news.length ? (
                  <div className="divide-y divide-foreground/10">
                    {snapshot.news.slice(0, 8).map((item) => (
                      <a key={item.id} href={item.sourceUrl ?? "#"} target="_blank" rel="noreferrer" className="group flex items-start justify-between gap-4 py-3">
                        <span className="text-sm leading-relaxed text-muted-foreground transition-colors group-hover:text-foreground">{item.title}</span>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="SoSoValue did not return live hot news for this refresh." />
                )}
              </Panel>
            </section>

            <Panel>
              <SectionHeading label="Readiness" title="Live source checks" />
              <div className="flex flex-wrap gap-2">
                <StatusPill ok={Boolean(snapshot?.config.sosovalueApi)} label="SoSoValue key" />
                <StatusPill ok={Boolean(snapshot?.config.openaiApi)} label="OpenAI key" />
                <StatusPill ok={Boolean(snapshot?.config.mongodb)} label="MongoDB URI" />
                <StatusPill ok={Boolean(snapshot?.config.sodexAccountId)} label="SoDEX account" />
                <StatusPill ok={Boolean(snapshot?.config.sodexVerifyingContract)} label="SoDEX contract" />
                <StatusPill ok={Boolean(snapshot?.chain?.isLive)} label="ValueChain RPC" />
              </div>
              {snapshot?.sourceNotes.length ? (
                <div className="mt-5 space-y-2 text-sm text-muted-foreground">
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
