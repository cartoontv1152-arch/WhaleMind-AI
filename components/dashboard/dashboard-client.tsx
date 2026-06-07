"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Bookmark,
  Check,
  LineChart,
  Link2,
  Loader2,
  Lock,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
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

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { VALUECHAIN_MAINNET, VALUECHAIN_TESTNET } from "@/lib/valuechain";
import type {
  AiSignal,
  AlertChannel,
  BacktestResult,
  DashboardHistoryPoint,
  DashboardSnapshot,
  OrderIntent,
  PortfolioHolding,
  UserAlert,
  UserBetaState,
} from "@/lib/whalemind-types";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

type JsonRecord = Record<string, unknown>;

function money(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "unavailable";
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

function ratioPct(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "unavailable";
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return pct(normalized);
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

function targetChain(environment?: "mainnet" | "testnet") {
  return environment === "testnet" ? VALUECHAIN_TESTNET : VALUECHAIN_MAINNET;
}

async function switchToValueChain(provider: EthereumProvider, environment?: "mainnet" | "testnet") {
  const chain = targetChain(environment);

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chain.hexChainId }],
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? Number(error.code) : undefined;
    if (code !== 4902) throw error;

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chain.hexChainId,
          chainName: chain.chainName,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [chain.rpcUrl],
          blockExplorerUrls: [chain.explorerUrl],
        },
      ],
    });
  }
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json()) as T & { error?: string; detail?: string };
  if (!response.ok || data.error) throw new Error(data.detail ?? data.error ?? "Request failed");
  return data as T;
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("border-b border-foreground/10 py-6", className)}>{children}</section>;
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 border px-3 py-1 text-xs font-mono",
        ok
          ? "border-whale-accent/30 bg-whale-accent/10 text-whale-accent"
          : "border-foreground/10 text-muted-foreground"
      )}
    >
      <span className={cn("size-1.5 rounded-full", ok ? "bg-whale-accent" : "bg-muted-foreground")} />
      {label}
    </span>
  );
}

function SectionHeading({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className="mb-4 flex flex-col gap-1">
      <h2 className="font-display text-2xl tracking-tight">{title}</h2>
      {caption ? <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{caption}</p> : null}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Alert className="border-dashed bg-transparent">
      <AlertCircle data-icon="inline-start" />
      <AlertTitle>Nothing to show yet</AlertTitle>
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}

function SignalTone({ signal }: { signal?: AiSignal }) {
  const tone =
    signal?.action === "BUY"
      ? "text-whale-accent"
      : signal?.action === "SELL"
        ? "text-whale-negative"
        : signal?.action === "HOLD"
          ? "text-foreground"
          : "text-muted-foreground";

  return <span className={tone}>{signal?.action ?? "NO LIVE SIGNAL"}</span>;
}

function isOrderableSignal(signal?: AiSignal): signal is AiSignal & { action: "BUY" | "SELL" } {
  return signal?.action === "BUY" || signal?.action === "SELL";
}

function ChartShell({ children, empty }: { children: ReactNode; empty: boolean }) {
  if (empty) return <EmptyState text="Not enough live or persisted data returned yet to draw this chart." />;
  return <div className="h-72 w-full">{children}</div>;
}

function LiveTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="border border-foreground/10 bg-background/95 p-3 text-xs shadow-xl">
      <div className="mb-2 font-mono text-muted-foreground">{label}</div>
      <div className="flex flex-col gap-1">
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
        <SectionHeading title={`${assetLabel} price and confidence`} caption="Per-asset signal history uses MongoDB snapshots when configured." />
        <ChartShell empty={priceHistory.length === 0}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={priceHistory} margin={{ left: 0, right: 12, top: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--whale-accent)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--whale-accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="price" tickFormatter={(value) => compact(Number(value))} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={54} />
              <YAxis yAxisId="confidence" orientation="right" domain={[0, 100]} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={34} />
              <Tooltip content={<LiveTooltip />} />
              <Area yAxisId="price" type="monotone" dataKey="price" name="price" stroke="var(--whale-accent)" fill="url(#priceFill)" strokeWidth={2} dot={priceHistory.length < 3} />
              <Area yAxisId="confidence" type="monotone" dataKey="confidence" name="confidence" stroke="var(--whale-info)" fill="transparent" strokeWidth={2} dot={priceHistory.length < 3} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartShell>
      </div>

      <div className="grid gap-8">
        <div>
          <SectionHeading title="SoSoValue 24h move" />
          <ChartShell empty={assetChart.length === 0}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={assetChart} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="symbol" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(value) => `${Number(value).toFixed(0)}%`} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={38} />
                <Tooltip content={<LiveTooltip />} />
                <Bar dataKey="change" name="24h change" fill="var(--whale-accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartShell>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <SectionHeading title="ETF net flow" />
            <ChartShell empty={flowChart.length === 0}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={flowChart} margin={{ left: 0, right: 6, top: 10, bottom: 0 }}>
                  <XAxis dataKey="symbol" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(value) => compact(Number(value))} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={46} />
                  <Tooltip content={<LiveTooltip />} />
                  <Bar dataKey="netInflow" name="net inflow" fill="var(--whale-info)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartShell>
          </div>
          <div>
            <SectionHeading title="SoDEX prints" />
            <ChartShell empty={whaleChart.length === 0}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={whaleChart} margin={{ left: 0, right: 6, top: 10, bottom: 0 }}>
                  <XAxis dataKey="asset" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(value) => compact(Number(value))} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={46} />
                  <Tooltip content={<LiveTooltip />} />
                  <Bar dataKey="notional" name="notional" fill="var(--whale-accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartShell>
          </div>
        </div>
      </div>
    </section>
  );
}

function SignalHistoryPanel({ asset, history }: { asset?: string; history: DashboardHistoryPoint[] }) {
  const points = asset
    ? history
        .map((point) => ({
          generatedAt: point.generatedAt,
          asset: point.assets.find((item) => item.symbol === asset),
          signal: point.signals.find((item) => item.asset === asset),
        }))
        .filter((point) => point.asset || point.signal)
        .slice(-8)
        .reverse()
    : [];

  return (
    <Panel>
      <SectionHeading title="Per-asset signal history" caption="Saved from MongoDB snapshots, scoped to the selected asset." />
      {points.length ? (
        <div className="flex flex-col gap-3">
          {points.map((point) => (
            <div key={`${point.generatedAt}-${asset}`} className="grid gap-2 border border-foreground/10 p-3 text-sm sm:grid-cols-[120px_1fr_100px]">
              <span className="font-mono text-xs text-muted-foreground">{formatTime(point.generatedAt)}</span>
              <span>{point.asset ? `${money(point.asset.price)} / ${pct(point.asset.change24h)}` : "asset snapshot unavailable"}</span>
              <span className="font-mono text-muted-foreground">
                {point.signal ? `${point.signal.action} ${point.signal.confidence}%` : "no signal"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text="Select an asset and keep MongoDB enabled to build persistent per-asset history." />
      )}
    </Panel>
  );
}

export function DashboardClient() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [userState, setUserState] = useState<UserBetaState | null>(null);
  const [wallet, setWallet] = useState<string>();
  const [status, setStatus] = useState("Sign wallet to open Wave 2 workspace");
  const [isLoading, setIsLoading] = useState(true);
  const [isWalletBusy, setIsWalletBusy] = useState(false);
  const [isOrderBusy, setIsOrderBusy] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<string>();
  const [notionalUsd, setNotionalUsd] = useState("250");
  const [accountId, setAccountId] = useState("");
  const [positionUsd, setPositionUsd] = useState("250");
  const [stopLossPct, setStopLossPct] = useState("5");
  const [takeProfitPct, setTakeProfitPct] = useState("10");
  const [portfolioQuantity, setPortfolioQuantity] = useState("0.1");
  const [portfolioCost, setPortfolioCost] = useState("0");
  const [alertConfidence, setAlertConfidence] = useState("75");
  const [alertChannel, setAlertChannel] = useState<AlertChannel>("in-app");
  const [intent, setIntent] = useState<OrderIntent | null>(null);
  const [executionResult, setExecutionResult] = useState<JsonRecord | null>(null);
  const lastAlertEvaluationKey = useRef("");
  const isAuthenticated = Boolean(userState?.authenticated && wallet);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await jsonRequest<DashboardSnapshot>("/api/dashboard", { cache: "no-store" });
      setSnapshot(data);
      setSelectedAsset((current) => current ?? data.signals[0]?.asset ?? data.assets[0]?.symbol);
      setStatus(data.state === "live" ? "Live data synced" : "Live data synced with source warnings");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Dashboard sync failed");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    if (!isAuthenticated) return;
    const interval = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(interval);
  }, [isAuthenticated, refresh]);

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;

    provider
      .request({ method: "eth_accounts" })
      .then(async (accounts) => {
        const [first] = accounts as string[];
        if (!first) return;
        setWallet(first);
        const data = await jsonRequest<{ state: UserBetaState }>(
          `/api/user-state?walletAddress=${encodeURIComponent(first)}`,
          { cache: "no-store" }
        );
        setUserState(data.state);
        setStatus(data.state.authenticated ? "Wallet session restored" : "Wallet detected; sign in to unlock saved state");
      })
      .catch(() => undefined);
  }, []);

  const topSignal = snapshot?.signals[0];
  const selectedSignal = useMemo(() => {
    return snapshot?.signals.find((signal) => signal.asset === selectedAsset) ?? topSignal;
  }, [selectedAsset, snapshot?.signals, topSignal]);
  const selectedMarket = snapshot?.assets.find((asset) => asset.symbol === selectedSignal?.asset);
  const selectedHistory = useMemo(() => {
    const assetSymbol = selectedSignal?.asset ?? snapshot?.assets[0]?.symbol;
    if (!assetSymbol) return [];
    return snapshot?.assetHistory[assetSymbol] ?? snapshot?.history ?? [];
  }, [selectedSignal?.asset, snapshot?.assetHistory, snapshot?.history, snapshot?.assets]);
  const priceHistory = useMemo(() => {
    const assetSymbol = selectedSignal?.asset ?? snapshot?.assets[0]?.symbol;
    if (!assetSymbol) return [];

    return selectedHistory
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
  }, [selectedSignal?.asset, snapshot?.assets, selectedHistory]);
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
  const selectedWatchlisted = Boolean(
    selectedSignal && userState?.watchlist.some((item) => item.symbol === selectedSignal.asset)
  );
  const canCreateOrderIntent = Boolean(snapshot?.sodex && isOrderableSignal(selectedSignal));

  const postUserAction = useCallback(
    async <T extends JsonRecord>(body: T) => {
      if (!wallet) throw new Error("Connect wallet first");
      const data = await jsonRequest<{ state: UserBetaState } & JsonRecord>("/api/user-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet, ...body }),
      });
      setUserState(data.state);
      return data;
    },
    [wallet]
  );

  useEffect(() => {
    if (!wallet || !userState?.authenticated || !snapshot?.signals.length || !userState.alerts.length) return;
    const key = `${wallet}-${snapshot.generatedAt}`;
    if (lastAlertEvaluationKey.current === key) return;
    lastAlertEvaluationKey.current = key;

    postUserAction({ action: "evaluate-alerts", signals: snapshot.signals })
      .then((data) => {
        const triggered = Array.isArray(data.triggered) ? data.triggered.length : 0;
        if (triggered > 0) setStatus(`${triggered} alert${triggered === 1 ? "" : "s"} triggered`);
      })
      .catch(() => undefined);
  }, [postUserAction, snapshot?.generatedAt, snapshot?.signals, userState?.alerts.length, userState?.authenticated, wallet]);

  const connectWallet = async () => {
    setIsWalletBusy(true);
    try {
      const provider = window.ethereum;
      if (!provider) {
        setStatus("Install MetaMask or another EVM wallet to log in");
        return;
      }

      await switchToValueChain(provider, snapshot?.config.sodexEnvironment);
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const connectedWallet = accounts[0];
      if (!connectedWallet) throw new Error("No wallet account returned");

      const challenge = await jsonRequest<{ message: string }>("/api/auth/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: connectedWallet }),
      });
      const signature = (await provider.request({
        method: "personal_sign",
        params: [challenge.message, connectedWallet],
      })) as string;
      const session = await jsonRequest<{ authenticated: boolean; state: UserBetaState }>("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: connectedWallet, message: challenge.message, signature }),
      });

      setWallet(connectedWallet);
      setUserState(session.state);
      setStatus("Wallet authenticated; Wave 2 workspace unlocked");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Wallet authentication rejected");
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
    if (!isOrderableSignal(selectedSignal)) {
      setStatus("Only BUY or SELL signals can create a SoDEX order intent");
      return;
    }

    setIsOrderBusy(true);
    setIntent(null);
    setExecutionResult(null);
    try {
      const data = await jsonRequest<OrderIntent>("/api/sodex/order-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: wallet,
          accountId: accountId ? Number(accountId) : undefined,
          symbol: snapshot.sodex.symbol,
          side: selectedSignal.action,
          notionalUsd: Number(notionalUsd),
          orderType: "MARKET",
        }),
      });
      setIntent(data);
      setStatus(data.executionMode === "dry-run" ? "Dry-run intent created; final SoDEX config missing" : "SoDEX intent ready for wallet signature");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Order intent failed");
    } finally {
      setIsOrderBusy(false);
    }
  };

  const signAndSubmitIntent = async () => {
    if (!wallet || !intent) return;
    const provider = window.ethereum;
    if (!provider) {
      setStatus("Wallet provider unavailable");
      return;
    }

    setIsOrderBusy(true);
    try {
      const signature = (await provider.request({
        method: "eth_signTypedData_v4",
        params: [wallet, JSON.stringify(intent.typedData)],
      })) as string;
      const result = await jsonRequest<JsonRecord>("/api/sodex/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent, signature, signerAddress: wallet, confirmed: true }),
      });
      setExecutionResult(result);
      setStatus(
        result.dryRun
          ? String(result.message ?? "Signed dry-run verified")
          : result.submitted
            ? "Signed SoDEX order submitted"
            : String(result.message ?? "SoDEX rejected signed order")
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Signed submission failed");
    } finally {
      setIsOrderBusy(false);
    }
  };

  const saveSelectedSignal = async () => {
    if (!selectedSignal || !snapshot) return;
    await postUserAction({ action: "save-signal", signal: selectedSignal, sourceGeneratedAt: snapshot.generatedAt });
    setStatus(`${selectedSignal.asset} signal saved`);
  };

  const toggleSelectedWatchlist = async () => {
    if (!selectedSignal) return;
    await postUserAction({ action: "toggle-watchlist", symbol: selectedSignal.asset });
    setStatus(`${selectedSignal.asset} watchlist updated`);
  };

  const createAlert = async () => {
    if (!selectedSignal) return;
    const existing = userState?.alerts.find((alert) => alert.asset === selectedSignal.asset);
    const alert: UserAlert = {
      id: existing?.id ?? `alert-${selectedSignal.asset.toLowerCase()}`,
      asset: selectedSignal.asset,
      minConfidence: Number(alertConfidence),
      action: "ANY",
      channel: alertChannel,
      enabled: true,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      lastTriggeredAt: existing?.lastTriggeredAt,
      lastTriggeredSignalId: existing?.lastTriggeredSignalId,
    };
    await postUserAction({ action: "upsert-alert", alert });
    setStatus(`${selectedSignal.asset} alert saved`);
  };

  const saveHolding = async () => {
    if (!selectedSignal) return;
    const holding: PortfolioHolding = {
      id: `holding-${selectedSignal.asset.toLowerCase()}`,
      asset: selectedSignal.asset,
      quantity: Number(portfolioQuantity),
      averageCostUsd: Number(portfolioCost),
      updatedAt: new Date().toISOString(),
    };
    await postUserAction({ action: "upsert-holding", holding });
    setStatus(`${selectedSignal.asset} portfolio snapshot saved`);
  };

  const runBacktest = async () => {
    if (!selectedSignal) return;
    const data = await postUserAction({
      action: "run-backtest",
      signal: selectedSignal,
      history: selectedHistory,
      positionUsd: Number(positionUsd),
      stopLossPct: Number(stopLossPct),
      takeProfitPct: Number(takeProfitPct),
    });
    const backtest = data.backtest as BacktestResult | undefined;
    setStatus(backtest ? `${selectedSignal.asset} backtest saved: ${pct(backtest.estimatedPnlPct)}` : "Backtest saved");
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-foreground/10 bg-background/90 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5">
          <a href="/" className="flex min-w-0 items-center gap-3">
            <ArrowLeft data-icon="inline-start" className="text-muted-foreground" />
            <span className="truncate font-display text-xl tracking-tight">WhaleMind AI</span>
          </a>

          <div className="hidden items-center gap-3 md:flex">
            <StatusPill ok={snapshot?.state === "live"} label={snapshot?.state ?? "syncing"} />
            <StatusPill ok={Boolean(userState?.authenticated)} label={userState?.authenticated ? "wallet auth" : "wallet locked"} />
            <span className="font-mono text-xs text-muted-foreground">{formatTime(snapshot?.generatedAt)}</span>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={isLoading} className="rounded-full border-foreground/20 bg-transparent">
              <RefreshCw data-icon="inline-start" className={cn(isLoading && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button type="button" size="sm" onClick={connectWallet} disabled={isWalletBusy} className="rounded-full px-4">
              {isWalletBusy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Wallet data-icon="inline-start" />}
              {shortAddress(wallet)}
            </Button>
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-[1280px] px-5 py-8">
        {!isAuthenticated ? (
          <section className="grid min-h-[calc(100vh-8rem)] items-center gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <Panel className="p-7 lg:p-10">
              <StatusPill ok={Boolean(wallet)} label={wallet ? "wallet detected" : "wallet required"} />
              <h1 className="mt-4 font-display text-5xl leading-none tracking-tight md:text-7xl">Wave 2 beta desk</h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
                {snapshot?.aiBrief ?? "WhaleMind is waiting for live SoSoValue, SSI, SoDEX, and ValueChain data."}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button type="button" onClick={connectWallet} disabled={isWalletBusy} className="h-12 rounded-full px-7">
                  {isWalletBusy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <ShieldCheck data-icon="inline-start" />}
                  Sign wallet
                </Button>
                <Button asChild variant="outline" className="h-12 rounded-full border-foreground/20 bg-transparent px-7">
                  <a href="/">Back to site</a>
                </Button>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                Wallet login signs a message only. SoDEX submission still requires a separate EIP-712 order signature.
              </p>
            </Panel>

            <Panel>
              <SectionHeading title="Live source readiness" caption="No dashboard row is fabricated; missing providers stay visible." />
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Assets", snapshot?.assets.length ?? 0],
                  ["Signals", snapshot?.signals.length ?? 0],
                  ["SSI", snapshot?.indices.length ?? 0],
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
                <StatusPill ok={Boolean(snapshot?.config.mongodb)} label="MongoDB" />
              </div>
              {snapshot?.sourceNotes.length ? (
                <div className="mt-5 flex flex-col gap-2 text-sm text-muted-foreground">
                  {snapshot.sourceNotes.slice(0, 4).map((note, index) => (
                    <div key={`${note}-${index}`} className="flex gap-2">
                      <AlertCircle data-icon="inline-start" className="mt-0.5 shrink-0" />
                      <span>{note}</span>
                    </div>
                  ))}
                </div>
              ) : null}
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
          <div className="flex flex-col gap-5">
            <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
              <Panel className="p-7">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <StatusPill ok={snapshot?.state === "live"} label={snapshot?.state ?? "syncing"} />
                  <StatusPill ok={snapshot?.config.sodexEnvironment === "testnet"} label={snapshot?.config.sodexEnvironment ?? "mainnet"} />
                  <span className="font-mono text-xs text-muted-foreground">{status}</span>
                </div>
                <h1 className="font-display text-5xl leading-none tracking-tight md:text-7xl">Private beta desk</h1>
                <p className="mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground">
                  {snapshot?.aiBrief ?? "Waiting for live market brief."}
                </p>
              </Panel>

              <Panel>
                <SectionHeading title={shortAddress(wallet)} caption="Wallet-authenticated workspace" />
                <div className="flex flex-col gap-3 text-sm">
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
                <div className="text-xs font-mono uppercase text-muted-foreground">Saved state</div>
                <div className="mt-2 font-display text-3xl">{(userState?.watchlist.length ?? 0) + (userState?.alerts.length ?? 0) + (userState?.savedSignals.length ?? 0)}</div>
                <div className="mt-2 text-sm text-muted-foreground">watchlist, alerts, signals</div>
              </Panel>
              <Panel>
                <div className="text-xs font-mono uppercase text-muted-foreground">Execution</div>
                <div className="mt-2 font-display text-3xl">{snapshot?.config.sodexLiveExecution ? "SIGNED" : "DRY-RUN"}</div>
                <div className="mt-2 text-sm text-muted-foreground">EIP-712 approval required</div>
              </Panel>
            </section>

            <Tabs defaultValue="research" className="flex flex-col gap-6">
              <TabsList className="grid h-auto w-full grid-cols-2 rounded-none border border-foreground/10 bg-transparent p-1 md:grid-cols-4">
                <TabsTrigger value="research" className="rounded-none">Research</TabsTrigger>
                <TabsTrigger value="execution" className="rounded-none">Execution</TabsTrigger>
                <TabsTrigger value="portfolio" className="rounded-none">Portfolio</TabsTrigger>
                <TabsTrigger value="readiness" className="rounded-none">Readiness</TabsTrigger>
              </TabsList>

              <TabsContent value="research" className="mt-0 flex flex-col gap-5">
                <MarketCharts
                  assetLabel={selectedSignal?.asset ?? "Asset"}
                  priceHistory={priceHistory}
                  assetChart={assetChart}
                  flowChart={flowChart}
                  whaleChart={whaleChart}
                />

                <section className="grid gap-5 lg:grid-cols-[1fr_380px]">
                  <Panel>
                    <SectionHeading title="AI signal board" caption="Select a signal to drive the history, alert, backtest, and SoDEX intent panes." />
                    {snapshot?.signals.length ? (
                      <div className="divide-y divide-foreground/10">
                        {snapshot.signals.map((signal) => (
                          <button
                            key={signal.id}
                            type="button"
                            onClick={() => setSelectedAsset(signal.asset)}
                            className={cn(
                              "grid w-full gap-3 py-4 text-left transition-colors md:grid-cols-[100px_100px_1fr_88px]",
                              selectedSignal?.asset === signal.asset && "text-whale-accent"
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

                  <SignalHistoryPanel asset={selectedSignal?.asset} history={selectedHistory} />
                </section>

                <section className="grid gap-5 lg:grid-cols-2">
                  <Panel>
                    <SectionHeading title="SoSoValue Indexes" caption="Live SSI market snapshots and constituent weights from the SoSoValue Index module." />
                    {snapshot?.indices.length ? (
                      <div className="flex flex-col gap-4">
                        {snapshot.indices.map((index) => (
                          <div key={index.ticker} className="border border-foreground/10 p-4">
                            <div className="mb-3 flex items-start justify-between gap-4">
                              <div>
                                <div className="font-display text-2xl">{index.name}</div>
                                <div className="font-mono text-xs text-muted-foreground">{index.ticker}</div>
                              </div>
                              <div className="text-right">
                                <div className="font-mono">{money(index.price)}</div>
                                <div className={cn("font-mono text-xs", index.change24h >= 0 ? "text-whale-positive" : "text-whale-negative")}>{ratioPct(index.change24h)}</div>
                              </div>
                            </div>
                            <div className="mb-3 grid grid-cols-4 gap-2 text-xs">
                              <span>7d {ratioPct(index.roi7d)}</span>
                              <span>1m {ratioPct(index.roi1m)}</span>
                              <span>3m {ratioPct(index.roi3m)}</span>
                              <span>YTD {ratioPct(index.ytd)}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {index.constituents.slice(0, 8).map((item) => (
                                <Badge key={`${index.ticker}-${item.symbol}`} variant="secondary">
                                  {item.symbol} {ratioPct(item.weight)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState text="No SoSoValue Index rows returned for the configured SSI ticker list." />
                    )}
                  </Panel>

                  <Panel>
                    <SectionHeading title="SoSoValue hot feed" />
                    {snapshot?.news.length ? (
                      <div className="divide-y divide-foreground/10">
                        {snapshot.news.slice(0, 8).map((item) => (
                          <a key={item.id} href={item.sourceUrl ?? "#"} target="_blank" rel="noreferrer" className="group flex items-start justify-between gap-4 py-3">
                            <span className="text-sm leading-relaxed text-muted-foreground transition-colors group-hover:text-foreground">{item.title}</span>
                            <ArrowRight data-icon="inline-end" className="mt-1 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                          </a>
                        ))}
                      </div>
                    ) : (
                      <EmptyState text="SoSoValue did not return live hot news for this refresh." />
                    )}
                  </Panel>
                </section>
              </TabsContent>

              <TabsContent value="execution" className="mt-0 grid gap-5 lg:grid-cols-[1fr_380px]">
                <Panel>
                  <SectionHeading title="Backtested simulator" caption="Uses persisted signal history where available; otherwise it uses the current live refresh window." />
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-xs font-mono text-muted-foreground">Position USD</label>
                      <Input value={positionUsd} onChange={(event) => setPositionUsd(event.target.value)} inputMode="decimal" />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-mono text-muted-foreground">Stop loss %</label>
                      <Input value={stopLossPct} onChange={(event) => setStopLossPct(event.target.value)} inputMode="decimal" />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-mono text-muted-foreground">Take profit %</label>
                      <Input value={takeProfitPct} onChange={(event) => setTakeProfitPct(event.target.value)} inputMode="decimal" />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button type="button" onClick={runBacktest} disabled={!selectedSignal}>
                      <LineChart data-icon="inline-start" />
                      Run backtest
                    </Button>
                    <Button type="button" variant="outline" onClick={saveSelectedSignal} disabled={!selectedSignal} className="bg-transparent">
                      <Save data-icon="inline-start" />
                      Save signal
                    </Button>
                    <Button type="button" variant="outline" onClick={toggleSelectedWatchlist} disabled={!selectedSignal} className="bg-transparent">
                      <Bookmark data-icon="inline-start" />
                      {selectedWatchlisted ? "Remove watch" : "Watch asset"}
                    </Button>
                  </div>
                  <Separator className="my-5" />
                  {userState?.backtests.length ? (
                    <div className="flex flex-col gap-3">
                      {userState.backtests.slice(0, 5).map((result) => (
                        <div key={result.id} className="grid gap-2 border border-foreground/10 p-3 text-sm md:grid-cols-[90px_1fr_110px]">
                          <span className="font-display text-xl">{result.asset}</span>
                          <span className="text-muted-foreground">
                            {result.action} / {result.lookbackPoints} points / RR {result.riskReward.toFixed(2)}
                          </span>
                          <span className={cn("font-mono", result.estimatedPnlUsd >= 0 ? "text-whale-positive" : "text-whale-negative")}>
                            {money(result.estimatedPnlUsd)} ({pct(result.estimatedPnlPct)})
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState text="Run a backtest from the selected signal to store the first risk result." />
                  )}
                </Panel>

                <Panel>
                  <SectionHeading title="SoDEX signed intent" caption="Create typed data, sign in wallet, then submit only if guarded execution is enabled." />
                  <div className="flex flex-col gap-4">
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
                    <div className="border border-foreground/10 p-4 text-sm">
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Asset</span>
                        <span className="font-mono">{selectedSignal?.asset ?? "unavailable"}</span>
                      </div>
                      <div className="mt-2 flex justify-between gap-4">
                        <span className="text-muted-foreground">Price</span>
                        <span className="font-mono">{money(selectedMarket?.price)}</span>
                      </div>
                      <div className="mt-2 flex justify-between gap-4">
                        <span className="text-muted-foreground">Route</span>
                        <span className="font-mono">{snapshot?.sodex?.symbol ?? "unavailable"}</span>
                      </div>
                    </div>
                    <Button type="button" onClick={createOrderIntent} disabled={isOrderBusy || !canCreateOrderIntent} className="h-12 w-full rounded-full">
                      {isOrderBusy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Link2 data-icon="inline-start" />}
                      Create intent
                    </Button>
                    {intent ? (
                      <div className="border border-whale-accent/20 bg-whale-accent/5 p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm text-whale-accent">
                          <Check data-icon="inline-start" />
                          {intent.executionMode === "dry-run" ? "Dry-run intent" : "Ready for EIP-712 signature"}
                        </div>
                        <div className="flex flex-col gap-2 font-mono text-xs text-muted-foreground">
                          <div>id: {intent.clOrdID}</div>
                          <div>mode: {intent.signingMode}</div>
                          <div className="break-all">hash: {intent.payloadHash}</div>
                          <div>nonce: {intent.nonce}</div>
                        </div>
                        {intent.warnings.length > 0 ? (
                          <ul className="mt-4 flex flex-col gap-2 text-xs text-muted-foreground">
                            {intent.warnings.map((warning) => (
                              <li key={warning} className="flex gap-2">
                                <Lock data-icon="inline-start" className="mt-0.5 shrink-0" />
                                <span>{warning}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <Button type="button" onClick={signAndSubmitIntent} disabled={isOrderBusy || intent.executionMode !== "ready-for-signature"} className="mt-4 h-11 w-full rounded-full">
                          {isOrderBusy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Send data-icon="inline-start" />}
                          Sign and submit
                        </Button>
                      </div>
                    ) : null}
                    {executionResult ? (
                      <Alert className="bg-transparent">
                        <ShieldCheck data-icon="inline-start" />
                        <AlertTitle>{executionResult.dryRun ? "Signed dry-run verified" : executionResult.submitted ? "Submission accepted" : "Submission rejected"}</AlertTitle>
                        <AlertDescription>{String(executionResult.message ?? executionResult.status ?? "SoDEX response captured.")}</AlertDescription>
                      </Alert>
                    ) : null}
                  </div>
                </Panel>
              </TabsContent>

              <TabsContent value="portfolio" className="mt-0 grid gap-5 lg:grid-cols-3">
                <Panel>
                  <SectionHeading title="Watchlist" caption="Wallet-owned and persisted through MongoDB." />
                  <div className="mb-4 flex flex-wrap gap-2">
                    {(userState?.watchlist ?? []).map((item) => (
                      <Badge key={item.symbol} variant="secondary">{item.symbol}</Badge>
                    ))}
                    {!userState?.watchlist.length ? <span className="text-sm text-muted-foreground">No watched assets yet.</span> : null}
                  </div>
                  <Button type="button" variant="outline" onClick={toggleSelectedWatchlist} disabled={!selectedSignal} className="bg-transparent">
                    <Bookmark data-icon="inline-start" />
                    Toggle selected
                  </Button>
                </Panel>

                <Panel>
                  <SectionHeading title="Alerts" caption="In-app alerts are immediate; Telegram and Discord use server env webhooks when configured." />
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-[1fr_110px] gap-3">
                      <Input value={alertConfidence} onChange={(event) => setAlertConfidence(event.target.value)} inputMode="numeric" />
                      <Button type="button" onClick={createAlert} disabled={!selectedSignal}>
                        <Bell data-icon="inline-start" />
                        Save
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(["in-app", "telegram", "discord"] as const).map((channel) => (
                        <Button
                          key={channel}
                          type="button"
                          size="sm"
                          variant={alertChannel === channel ? "default" : "outline"}
                          onClick={() => setAlertChannel(channel)}
                          className={cn(alertChannel !== channel && "bg-transparent")}
                        >
                          {channel}
                        </Button>
                      ))}
                    </div>
                    <div className="flex flex-col gap-2">
                      {(userState?.alerts ?? []).map((alert) => (
                        <div key={alert.id} className="border border-foreground/10 p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-display text-xl">{alert.asset}</span>
                            <Badge variant="outline">{alert.channel}</Badge>
                          </div>
                          <div className="mt-2 text-muted-foreground">
                            {alert.action} at {alert.minConfidence}% confidence
                          </div>
                          {alert.lastTriggeredAt ? <div className="mt-1 font-mono text-xs text-whale-accent">triggered {formatTime(alert.lastTriggeredAt)}</div> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </Panel>

                <Panel>
                  <SectionHeading title="Portfolio snapshot" caption="Manual beta snapshot for portfolio-aware recommendations." />
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="mb-2 block text-xs font-mono text-muted-foreground">Quantity</label>
                      <Input value={portfolioQuantity} onChange={(event) => setPortfolioQuantity(event.target.value)} inputMode="decimal" />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-mono text-muted-foreground">Average cost USD</label>
                      <Input value={portfolioCost} onChange={(event) => setPortfolioCost(event.target.value)} inputMode="decimal" />
                    </div>
                    <Button type="button" onClick={saveHolding} disabled={!selectedSignal}>
                      <Save data-icon="inline-start" />
                      Save holding
                    </Button>
                    <div className="flex flex-col gap-2">
                      {(userState?.portfolio ?? []).map((holding) => {
                        const market = snapshot?.assets.find((asset) => asset.symbol === holding.asset);
                        const currentValue = market ? market.price * holding.quantity : undefined;
                        const cost = holding.averageCostUsd * holding.quantity;
                        return (
                          <div key={holding.id} className="border border-foreground/10 p-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-display text-xl">{holding.asset}</span>
                              <span className="font-mono">{currentValue ? money(currentValue) : "unpriced"}</span>
                            </div>
                            <div className="mt-2 text-muted-foreground">
                              {holding.quantity} units / cost {money(cost)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Panel>

                <Panel className="lg:col-span-3">
                  <SectionHeading title="Saved signals" />
                  {userState?.savedSignals.length ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {userState.savedSignals.slice(0, 6).map((item) => (
                        <div key={item.id} className="border border-foreground/10 p-4">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="font-display text-2xl">{item.signal.asset}</span>
                            <Badge variant="outline">{item.signal.confidence}%</Badge>
                          </div>
                          <p className="text-sm leading-relaxed text-muted-foreground">{item.signal.thesis}</p>
                          <div className="mt-3 font-mono text-xs text-muted-foreground">saved {formatTime(item.savedAt)}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState text="Save a selected signal from the Execution tab to build research memory." />
                  )}
                </Panel>
              </TabsContent>

              <TabsContent value="readiness" className="mt-0 flex flex-col gap-5">
                <Panel>
                  <SectionHeading title="Live source checks" caption="Wave 2 treats persistence, wallet auth, signed submission, and alert delivery as first-class readiness gates." />
                  <div className="flex flex-wrap gap-2">
                    <StatusPill ok={Boolean(snapshot?.config.sosovalueApi)} label="SoSoValue key" />
                    <StatusPill ok={Boolean(snapshot?.config.openaiApi)} label="OpenAI key" />
                    <StatusPill ok={Boolean(snapshot?.config.mongodb)} label="MongoDB URI" />
                    <StatusPill ok={Boolean(snapshot?.config.walletSessionSecret)} label="session secret" />
                    <StatusPill ok={Boolean(snapshot?.config.sodexAccountId)} label="SoDEX account" />
                    <StatusPill ok={Boolean(snapshot?.config.sodexApiKeyName || !snapshot?.config.sodexLiveExecution)} label="SoDEX key mode" />
                    <StatusPill ok={Boolean(snapshot?.config.sodexVerifyingContract)} label="SoDEX contract" />
                    <StatusPill ok={Boolean(snapshot?.chain?.isLive)} label="ValueChain RPC" />
                    <StatusPill ok={Boolean(snapshot?.config.alertDelivery.telegram || snapshot?.config.alertDelivery.discord)} label="alert delivery" />
                  </div>
                  {snapshot?.sourceNotes.length ? (
                    <div className="mt-5 flex flex-col gap-2 text-sm text-muted-foreground">
                      {snapshot.sourceNotes.map((note, index) => (
                        <div key={`${note}-${index}`} className="flex gap-2">
                          <AlertCircle data-icon="inline-start" className="mt-0.5 shrink-0" />
                          <span>{note}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </Panel>

                <Panel>
                  <SectionHeading title="Execution proof" caption="The current flow separates signal, simulator, typed intent, wallet signature, and guarded submission." />
                  <div className="grid gap-3 md:grid-cols-5">
                    {[
                      ["Signal", Boolean(selectedSignal)],
                      ["Simulation", Boolean(userState?.backtests.length)],
                      ["Intent", Boolean(intent)],
                      ["Signature", Boolean(executionResult)],
                      ["Submit gate", Boolean(snapshot?.config.sodexLiveExecution)],
                    ].map(([label, ok]) => (
                      <div key={String(label)} className="border border-foreground/10 p-4">
                        <div className={cn("font-display text-2xl", ok ? "text-whale-accent" : "text-muted-foreground")}>{ok ? "Ready" : "Open"}</div>
                        <div className="text-xs text-muted-foreground">{label}</div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </main>
  );
}
