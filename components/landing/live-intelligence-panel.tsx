"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Link2, Loader2, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { VALUECHAIN_MAINNET } from "@/lib/valuechain";
import type { WhaleMindSnapshot } from "@/lib/whalemind-types";

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

export function LiveIntelligencePanel() {
  const [snapshot, setSnapshot] = useState<WhaleMindSnapshot | null>(null);
  const [wallet, setWallet] = useState<string>();
  const [status, setStatus] = useState("Syncing WhaleMind");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const response = await fetch("/api/intelligence", { cache: "no-store" });
        const data = (await response.json()) as WhaleMindSnapshot;
        if (!mounted) return;
        setSnapshot(data);
        setStatus(data.state === "live" ? "Live on-chain intelligence" : "Protected live/fallback mix");
      } catch {
        if (mounted) setStatus("Waiting for providers");
      }
    };

    load();
    const interval = window.setInterval(load, 30_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const topSignal = snapshot?.signals[0];
  const topWhale = snapshot?.whaleEvents[0];
  const btc = snapshot?.assets.find((asset) => asset.symbol === "BTC") ?? snapshot?.assets[0];

  const signalTone = useMemo(() => {
    if (!topSignal) return "text-muted-foreground";
    if (topSignal.action === "BUY") return "text-whale-accent";
    if (topSignal.action === "SELL") return "text-whale-negative";
    return "text-white";
  }, [topSignal]);

  const connectWallet = async () => {
    setIsBusy(true);
    try {
      const provider = window.ethereum;
      if (!provider) {
        setStatus("MetaMask or an EVM wallet is required");
        return;
      }

      await switchToValueChain(provider);
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      setWallet(accounts[0]);
      setStatus("Wallet ready on ValueChain");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Wallet connection rejected");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 bg-foreground/[0.02] border border-foreground/10 p-8 lg:p-10 transition-all duration-700">
        <div className="flex items-center justify-between gap-4 mb-8">
          <span className="text-xs font-mono text-muted-foreground">AI signal engine</span>
          <span className="flex items-center gap-2 text-xs font-mono text-whale-accent">
            <span className="w-2 h-2 rounded-full bg-whale-accent animate-pulse" />
            {snapshot?.state ?? "sync"}
          </span>
        </div>

        <div className="text-4xl md:text-5xl lg:text-6xl font-display tracking-tight mb-3">
          <span className={signalTone}>{topSignal?.action ?? "SYNC"}</span>
        </div>
        <p className="text-lg text-foreground mb-2">
          {topSignal ? `${topSignal.asset} at ${topSignal.confidence}% confidence` : "Loading SoSoValue data"}
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed min-h-16">
          {topSignal?.thesis ?? "WhaleMind is assembling ETF flow, SoDEX order-book data, and chain status."}
        </p>
      </div>

      <div className="bg-foreground/[0.02] border border-foreground/10 p-8 flex flex-col justify-between gap-8">
        <div>
          <div className="text-sm text-muted-foreground font-mono mb-2">Whale activity</div>
          <div className="text-base text-foreground mb-6">{topWhale?.summary ?? "Scanning large prints"}</div>
          <div className="h-1 w-full bg-foreground/10 overflow-hidden">
            <div
              className="h-full bg-whale-accent transition-all duration-500"
              style={{ width: `${topWhale?.confidence ?? 20}%` }}
            />
          </div>
        </div>
        <div>
          <div className="text-4xl lg:text-5xl font-display tracking-tight">{money(topWhale?.notionalUsd)}</div>
          <div className="text-sm text-muted-foreground mt-2">
            {topWhale ? `${topWhale.direction} via ${topWhale.source}` : "Awaiting SoDEX stream"}
          </div>
        </div>
      </div>

      <div className="bg-foreground/[0.02] border border-foreground/10 p-8 flex flex-col justify-between gap-8">
        <div>
          <div className="text-sm text-muted-foreground font-mono mb-2">Research to execution</div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <span className="block text-xs text-muted-foreground">BTC spot</span>
              <span className="text-2xl font-display">{money(btc?.price)}</span>
              <span className="block text-xs text-muted-foreground">{pct(btc?.change24h)}</span>
            </div>
            <div>
              <span className="block text-xs text-muted-foreground">SoDEX route</span>
              <span className="text-2xl font-display">{snapshot?.sodex.symbol ?? "vBTC_vUSDC"}</span>
              <span className="block text-xs text-muted-foreground">
                {snapshot?.chain.isLive ? `Block ${snapshot.chain.blockNumber}` : "RPC guarded"}
              </span>
            </div>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed min-h-14">
            {snapshot?.aiBrief ?? "AI brief will appear after the first market snapshot."}
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              type="button"
              onClick={connectWallet}
              disabled={isBusy}
              className="bg-foreground text-background hover:bg-foreground/90 rounded-full"
            >
              {isBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wallet className="w-4 h-4 mr-2" />}
              {shortAddress(wallet)}
            </Button>
            <Button
              asChild
              variant="outline"
              className="rounded-full border-foreground/20 hover:bg-foreground/5"
            >
              <a href="/dashboard">
                <Link2 className="w-4 h-4 mr-2" />
                Open dashboard
              </a>
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
            <ArrowRight className="w-3.5 h-3.5" />
            <span>{status}</span>
          </div>
        </div>
      </div>

      <div className="lg:col-span-3 mt-4 pt-8 border-t border-foreground/10 flex flex-wrap items-center gap-x-10 gap-y-3 text-sm font-mono text-muted-foreground">
        {(snapshot?.news ?? []).slice(0, 4).map((item) => (
          <a key={item.id} href={item.sourceUrl ?? "#"} target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">
            {item.title}
          </a>
        ))}
      </div>
    </div>
  );
}
