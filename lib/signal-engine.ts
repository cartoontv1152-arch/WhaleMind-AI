import { generateAiBrief } from "@/lib/ai";
import { persistSnapshot } from "@/lib/db";
import {
  getLiveSodexMarket,
  getLiveSodexMarketsForAssets,
  getLiveSodexWhaleEvents,
  getLiveSodexWhaleEventsForAssets,
  getSodexRoutesForAssets,
  getValueChainStatus,
} from "@/lib/sodex";
import {
  getSosoEtfFlows,
  getSosoHotNews,
  getSosoIndices,
  getSosoMacroEvents,
  getSosoMarketAssets,
  getSosoRateLimitStatus,
} from "@/lib/sosovalue";
import type { AiSignal, EtfFlow, MarketAsset, SodexMarket, WhaleEvent, WhaleMindSnapshot } from "@/lib/whalemind-types";

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
          ? `${asset.symbol} has aligned momentum, liquidity, and flow support for a candidate long setup.`
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

export async function getWhaleMindSnapshot({ persist = false }: { persist?: boolean } = {}): Promise<WhaleMindSnapshot> {
  const generatedAt = new Date().toISOString();
  const sourceNotes: string[] = [];

  const [assetsResult, flowsResult, indicesResult, macroResult, newsResult, chain] = await Promise.allSettled([
    getSosoMarketAssets(),
    getSosoEtfFlows(),
    getSosoIndices(),
    getSosoMacroEvents(),
    getSosoHotNews(),
    getValueChainStatus(),
  ]);

  const assets = assetsResult.status === "fulfilled" ? assetsResult.value : [];
  if (assetsResult.status === "rejected") sourceNotes.push("SoSoValue market data unavailable");
  if (assetsResult.status === "fulfilled" && assets.length === 0) sourceNotes.push("SoSoValue returned no configured market assets");

  const etfFlows = flowsResult.status === "fulfilled" ? flowsResult.value : [];
  if (flowsResult.status === "rejected") sourceNotes.push("SoSoValue ETF flow unavailable");

  const indices = indicesResult.status === "fulfilled" ? indicesResult.value : [];
  if (indicesResult.status === "rejected") sourceNotes.push("SoSoValue Index data unavailable");

  const macro = macroResult.status === "fulfilled" ? macroResult.value : { days: [], tracked: [] };
  if (macroResult.status === "rejected") sourceNotes.push("SoSoValue macro calendar unavailable");

  const news = newsResult.status === "fulfilled" ? newsResult.value : [];
  if (newsResult.status === "rejected") sourceNotes.push("SoSoValue news unavailable");

  const liveChain = chain.status === "fulfilled" ? chain.value : undefined;
  if (chain.status === "rejected") sourceNotes.push("ValueChain RPC unavailable");
  if (liveChain && !liveChain.isLive) sourceNotes.push("ValueChain RPC did not confirm live status for this refresh.");

  const sodexRoutes = getSodexRoutesForAssets(assets.map((asset) => asset.symbol));
  const [sodexMarketsResult, sodexWhales] = await Promise.allSettled([
    assets.length > 0
      ? getLiveSodexMarketsForAssets(assets.map((asset) => asset.symbol))
      : getLiveSodexMarket().then((market): Record<string, SodexMarket> => ({ BTC: market })),
    assets.length > 0 ? getLiveSodexWhaleEventsForAssets(assets.map((asset) => asset.symbol)) : getLiveSodexWhaleEvents(),
  ]);
  const sodexMarkets: Record<string, SodexMarket> = sodexMarketsResult.status === "fulfilled" ? sodexMarketsResult.value : {};
  const liveSodex = assets[0] ? sodexMarkets[assets[0].symbol] ?? Object.values(sodexMarkets)[0] : Object.values(sodexMarkets)[0];
  if (sodexMarketsResult.status === "rejected" || !liveSodex) sourceNotes.push("SoDEX market data unavailable");

  const whales = sodexWhales.status === "fulfilled" ? sodexWhales.value : [];
  if (sodexWhales.status === "rejected") sourceNotes.push("SoDEX trade tape unavailable");

  const signals = assets.length > 0 ? buildSignals(assets, etfFlows, whales) : [];
  const aiBrief =
    assets.length > 0
      ? await generateAiBrief({ assets, etfFlows, news, whaleEvents: whales, signals })
      : "Live market sources are not ready yet. Configure SoSoValue, SoDEX, and ValueChain providers to enable signals.";
  const state = sourceNotes.length === 0 && liveChain?.isLive ? "live" : sourceNotes.length < 5 ? "partial" : "unavailable";

  const snapshot: WhaleMindSnapshot = {
    generatedAt,
    state,
    sourceNotes: sourceNotes.length > 0 ? sourceNotes : ["Live SoSoValue, SoDEX, and ValueChain reads completed."],
    assets,
    etfFlows,
    indices,
    macro,
    news,
    whaleEvents: whales,
    signals,
    sodex: liveSodex,
    sodexMarkets,
    sodexRoutes,
    chain: liveChain,
    aiBrief,
    sosoRateLimit: getSosoRateLimitStatus(),
  };

  if (persist && snapshot.assets.length > 0 && snapshot.sodex && snapshot.chain) {
    await persistSnapshot(snapshot);
  }

  return snapshot;
}
