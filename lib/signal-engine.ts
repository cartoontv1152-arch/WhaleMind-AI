import { generateAiBrief } from "@/lib/ai";
import { buildFallbackSnapshot, buildFallbackWhaleEvents, fallbackAssets, fallbackEtfFlows, fallbackNews, fallbackSignals } from "@/lib/fallback-data";
import { persistSnapshot } from "@/lib/db";
import { getSodexMarket, getSodexWhaleEvents, getValueChainStatus } from "@/lib/sodex";
import { getSosoEtfFlows, getSosoHotNews, getSosoMarketAssets } from "@/lib/sosovalue";
import type { AiSignal, EtfFlow, MarketAsset, WhaleEvent, WhaleMindSnapshot } from "@/lib/whalemind-types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function flowFor(symbol: string, flows: EtfFlow[]) {
  return flows.find((flow) => flow.symbol === symbol)?.netInflow ?? 0;
}

function whaleFor(symbol: string, whales: WhaleEvent[]) {
  return whales.find((event) => event.asset.toUpperCase() === symbol.toUpperCase())?.notionalUsd ?? 0;
}

export function buildSignals(assets: MarketAsset[], flows: EtfFlow[], whales: WhaleEvent[]): AiSignal[] {
  return assets.slice(0, 4).map((asset) => {
    const etfFlow = flowFor(asset.symbol, flows);
    const whaleUsd = whaleFor(asset.symbol, whales);
    const momentumScore = clamp(asset.change24h * 4, -20, 20);
    const flowScore = clamp(etfFlow / 10_000_000, -18, 18);
    const whaleScore = clamp(whaleUsd / 200_000, 0, 16);
    const confidence = Math.round(clamp(58 + momentumScore + flowScore + whaleScore, 35, 94));
    const action = confidence >= 76 ? "BUY" : confidence <= 42 ? "SELL" : confidence >= 60 ? "HOLD" : "WATCH";
    const risk = Math.abs(asset.change24h) > 6 || confidence < 50 ? "high" : confidence > 78 ? "medium" : "medium";

    return {
      id: `signal-${asset.symbol.toLowerCase()}`,
      asset: asset.symbol,
      action,
      confidence,
      risk,
      thesis:
        action === "BUY"
          ? `${asset.symbol} has aligned momentum, liquidity, and flow support for a simulated long setup.`
          : action === "SELL"
            ? `${asset.symbol} shows enough weakness that WhaleMind would de-risk before execution.`
            : `${asset.symbol} has incomplete confirmation; monitor flow before routing to SoDEX.`,
      drivers: [
        `${asset.change24h.toFixed(2)}% 24h move`,
        `${compact(etfFlow)} ETF net flow`,
        `${compact(whaleUsd)} tracked order-book/whale exposure`,
      ],
    };
  });
}

export async function getWhaleMindSnapshot(): Promise<WhaleMindSnapshot> {
  const generatedAt = new Date().toISOString();
  const sourceNotes: string[] = [];

  const [assetsResult, flowsResult, newsResult, sodex, chain, sodexWhales] = await Promise.allSettled([
    getSosoMarketAssets(),
    getSosoEtfFlows(),
    getSosoHotNews(),
    getSodexMarket(),
    getValueChainStatus(),
    getSodexWhaleEvents(),
  ]);

  const assets =
    assetsResult.status === "fulfilled" && assetsResult.value.length > 0 ? assetsResult.value : fallbackAssets;
  if (assetsResult.status === "rejected") sourceNotes.push(assetsResult.reason?.message ?? "SoSoValue markets fallback");

  const etfFlows =
    flowsResult.status === "fulfilled" && flowsResult.value.length > 0 ? flowsResult.value : fallbackEtfFlows;
  if (flowsResult.status === "rejected") sourceNotes.push(flowsResult.reason?.message ?? "SoSoValue ETF fallback");

  const news = newsResult.status === "fulfilled" && newsResult.value.length > 0 ? newsResult.value : fallbackNews;
  if (newsResult.status === "rejected") sourceNotes.push(newsResult.reason?.message ?? "SoSoValue news fallback");

  const liveSodex = sodex.status === "fulfilled" ? sodex.value : undefined;
  if (sodex.status === "rejected") sourceNotes.push(sodex.reason?.message ?? "SoDEX market fallback");

  const liveChain = chain.status === "fulfilled" ? chain.value : undefined;
  if (chain.status === "rejected") sourceNotes.push(chain.reason?.message ?? "ValueChain fallback");
  if (liveChain && !liveChain.isLive && liveChain.error) sourceNotes.push(liveChain.error);

  const whales =
    sodexWhales.status === "fulfilled" && sodexWhales.value.length > 0
      ? sodexWhales.value
      : buildFallbackWhaleEvents(generatedAt);
  if (sodexWhales.status === "rejected") sourceNotes.push(sodexWhales.reason?.message ?? "SoDEX whale fallback");

  const signals = buildSignals(assets, etfFlows, whales);
  const aiBrief = await generateAiBrief({ assets, etfFlows, news, whaleEvents: whales, signals });
  const state = sourceNotes.length === 0 ? "live" : sourceNotes.length < 3 ? "partial" : "fallback";

  const snapshot: WhaleMindSnapshot = {
    generatedAt,
    state,
    sourceNotes: sourceNotes.length > 0 ? sourceNotes : ["Live SoSoValue, SoDEX, and ValueChain reads completed."],
    assets,
    etfFlows,
    news,
    whaleEvents: whales,
    signals: signals.length > 0 ? signals : fallbackSignals,
    sodex: liveSodex ?? buildFallbackSnapshot().sodex,
    chain: liveChain ?? buildFallbackSnapshot().chain,
    aiBrief,
  };

  await persistSnapshot(snapshot);
  return snapshot;
}
