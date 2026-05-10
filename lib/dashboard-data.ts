import { generateAiBrief } from "@/lib/ai";
import { getDashboardHistory, persistSnapshot } from "@/lib/db";
import { buildSignals } from "@/lib/signal-engine";
import {
  getLiveSodexMarket,
  getLiveSodexWhaleEvents,
  getSodexRuntimeConfig,
  getValueChainStatus,
} from "@/lib/sodex";
import { getSosoEtfFlows, getSosoHotNews, getSosoMarketAssets } from "@/lib/sosovalue";
import type { DashboardHistoryPoint, DashboardSnapshot, RuntimeConfigStatus } from "@/lib/whalemind-types";

function reason(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function runtimeConfig(): RuntimeConfigStatus {
  const sodex = getSodexRuntimeConfig();

  return {
    sosovalueApi: Boolean(process.env.SOSOVALUE_API_KEY),
    openaiApi: Boolean(process.env.OPENAI_API_KEY),
    mongodb: Boolean(process.env.MONGODB_URI),
    sodexAccountId: sodex.hasDefaultAccountId,
    sodexVerifyingContract: sodex.hasVerifyingContract,
    sodexLiveExecution: sodex.liveExecutionEnabled,
  };
}

function currentHistoryPoint(snapshot: Omit<DashboardSnapshot, "history" | "config">): DashboardHistoryPoint | undefined {
  if (snapshot.assets.length === 0 && !snapshot.sodex && !snapshot.chain) return undefined;

  return {
    generatedAt: snapshot.generatedAt,
    assets: snapshot.assets.map((asset) => ({
      symbol: asset.symbol,
      price: asset.price,
      change24h: asset.change24h,
      volume24h: asset.volume24h,
      marketCap: asset.marketCap,
    })),
    signals: snapshot.signals.map((signal) => ({
      asset: signal.asset,
      action: signal.action,
      confidence: signal.confidence,
    })),
    sodex: snapshot.sodex
      ? {
          symbol: snapshot.sodex.symbol,
          lastPrice: snapshot.sodex.lastPrice,
          priceChange24h: snapshot.sodex.priceChange24h,
          volume24h: snapshot.sodex.volume24h,
          bid: snapshot.sodex.bid,
          ask: snapshot.sodex.ask,
        }
      : undefined,
    chain: snapshot.chain
      ? {
          blockNumber: snapshot.chain.blockNumber,
        }
      : undefined,
  };
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const generatedAt = new Date().toISOString();
  const sourceNotes: string[] = [];
  const config = runtimeConfig();

  const [assetsResult, flowsResult, newsResult, marketResult, chainResult, whaleResult] = await Promise.allSettled([
    getSosoMarketAssets(),
    getSosoEtfFlows(),
    getSosoHotNews(),
    getLiveSodexMarket(),
    getValueChainStatus(),
    getLiveSodexWhaleEvents(),
  ]);

  const assets = assetsResult.status === "fulfilled" ? assetsResult.value : [];
  if (assetsResult.status === "rejected") sourceNotes.push(reason(assetsResult.reason, "SoSoValue market data unavailable"));

  const etfFlows = flowsResult.status === "fulfilled" ? flowsResult.value : [];
  if (flowsResult.status === "rejected") sourceNotes.push(reason(flowsResult.reason, "SoSoValue ETF flow unavailable"));

  const news = newsResult.status === "fulfilled" ? newsResult.value : [];
  if (newsResult.status === "rejected") sourceNotes.push(reason(newsResult.reason, "SoSoValue news unavailable"));

  const sodex = marketResult.status === "fulfilled" ? marketResult.value : undefined;
  if (marketResult.status === "rejected") sourceNotes.push(reason(marketResult.reason, "SoDEX market data unavailable"));

  const chain = chainResult.status === "fulfilled" ? chainResult.value : undefined;
  if (chainResult.status === "rejected") sourceNotes.push(reason(chainResult.reason, "ValueChain RPC unavailable"));
  if (chain && !chain.isLive && chain.error) sourceNotes.push(chain.error);

  const whaleEvents = whaleResult.status === "fulfilled" ? whaleResult.value : [];
  if (whaleResult.status === "rejected") sourceNotes.push(reason(whaleResult.reason, "SoDEX trade tape unavailable"));

  const signals = assets.length > 0 ? buildSignals(assets, etfFlows, whaleEvents) : [];
  const aiBrief =
    assets.length > 0
      ? await generateAiBrief({ assets, etfFlows, news, whaleEvents, signals })
      : "Live market sources are not ready yet.";

  const baseSnapshot: Omit<DashboardSnapshot, "history" | "config"> = {
    generatedAt,
    state: sourceNotes.length === 0 && chain?.isLive ? "live" : "partial",
    sourceNotes,
    assets,
    etfFlows,
    news,
    whaleEvents,
    signals,
    sodex,
    chain,
    aiBrief,
  };

  if (assets.length > 0 && sodex && chain) {
    const result = await persistSnapshot({
      ...baseSnapshot,
      state: baseSnapshot.state,
      sodex,
      chain,
      aiBrief,
    });
    if (!result.stored && config.mongodb) {
      sourceNotes.push(`MongoDB history not stored: ${result.reason}`);
    }
  }

  const currentPoint = currentHistoryPoint(baseSnapshot);
  const storedHistory = await getDashboardHistory();
  const history = storedHistory.length > 0 ? storedHistory : currentPoint ? [currentPoint] : [];

  return {
    ...baseSnapshot,
    sourceNotes: sourceNotes.length > 0 ? sourceNotes : ["All live dashboard sources responded."],
    history,
    config,
  };
}
