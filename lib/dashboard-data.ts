import { generateAiBrief } from "@/lib/ai";
import { getDashboardHistory, persistSnapshot } from "@/lib/db";
import { buildSignals } from "@/lib/signal-engine";
import {
  getLiveSodexMarket,
  getLiveSodexMarketsForAssets,
  getLiveSodexWhaleEvents,
  getLiveSodexWhaleEventsForAssets,
  getSodexRoutesForAssets,
  getSodexRuntimeConfig,
  getValueChainStatus,
} from "@/lib/sodex";
import {
  getSosoEtfFlows,
  getSosoHotNews,
  getSosoIndices,
  getSosoMacroEvents,
  getSosoMarketAssets,
  getSosoRateLimitStatus,
  getSosoRefreshSeconds,
} from "@/lib/sosovalue";
import { hasConfiguredWalletSessionSecret } from "@/lib/wallet-session";
import type { DashboardHistoryPoint, DashboardSnapshot, RuntimeConfigStatus, SodexMarket } from "@/lib/whalemind-types";

function reason(_error: unknown, fallback: string) {
  return fallback;
}

function runtimeConfig(): RuntimeConfigStatus {
  const sodex = getSodexRuntimeConfig();

  return {
    sosovalueApi: Boolean(process.env.SOSOVALUE_API_KEY),
    openaiApi: Boolean(process.env.OPENAI_API_KEY),
    mongodb: Boolean(process.env.MONGODB_URI),
    mongodbRequired: process.env.MONGODB_REQUIRED !== "false",
    walletSessionSecret: hasConfiguredWalletSessionSecret(),
    sodexEnvironment: sodex.environment,
    sodexAccountId: sodex.hasDefaultAccountId,
    sodexApiKeyName: sodex.hasApiKeyName,
    sodexVerifyingContract: sodex.hasVerifyingContract,
    sodexLiveExecution: sodex.liveExecutionEnabled,
    alertDelivery: {
      telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      discord: Boolean(process.env.DISCORD_WEBHOOK_URL),
    },
    sosovalueRateLimit: getSosoRateLimitStatus(),
    sosovalueRefreshSeconds: getSosoRefreshSeconds(),
  };
}

function currentHistoryPoint(
  snapshot: Omit<DashboardSnapshot, "history" | "assetHistory" | "config">
): DashboardHistoryPoint | undefined {
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
    indices: snapshot.indices.map((index) => ({
      ticker: index.ticker,
      name: index.name,
      price: index.price,
      change24h: index.change24h,
      roi7d: index.roi7d,
      roi1m: index.roi1m,
      roi3m: index.roi3m,
      ytd: index.ytd,
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

export async function getDashboardSnapshot({ persist = true }: { persist?: boolean } = {}): Promise<DashboardSnapshot> {
  const generatedAt = new Date().toISOString();
  const sourceNotes: string[] = [];
  let config = runtimeConfig();

  const [assetsResult, flowsResult, indicesResult, macroResult, newsResult, chainResult] =
    await Promise.allSettled([
      getSosoMarketAssets(),
      getSosoEtfFlows(),
      getSosoIndices(),
      getSosoMacroEvents(),
      getSosoHotNews(),
      getValueChainStatus(),
    ]);

  const assets = assetsResult.status === "fulfilled" ? assetsResult.value : [];
  if (assetsResult.status === "rejected") sourceNotes.push(reason(assetsResult.reason, "SoSoValue market data unavailable"));

  const etfFlows = flowsResult.status === "fulfilled" ? flowsResult.value : [];
  if (flowsResult.status === "rejected") sourceNotes.push(reason(flowsResult.reason, "SoSoValue ETF flow unavailable"));

  const indices = indicesResult.status === "fulfilled" ? indicesResult.value : [];
  if (indicesResult.status === "rejected") sourceNotes.push(reason(indicesResult.reason, "SoSoValue Index data unavailable"));

  const macro = macroResult.status === "fulfilled" ? macroResult.value : { days: [], tracked: [] };
  if (macroResult.status === "rejected") sourceNotes.push(reason(macroResult.reason, "SoSoValue macro calendar unavailable"));

  const news = newsResult.status === "fulfilled" ? newsResult.value : [];
  if (newsResult.status === "rejected") sourceNotes.push(reason(newsResult.reason, "SoSoValue news unavailable"));

  const chain = chainResult.status === "fulfilled" ? chainResult.value : undefined;
  if (chainResult.status === "rejected") sourceNotes.push(reason(chainResult.reason, "ValueChain RPC unavailable"));
  if (chain && !chain.isLive) sourceNotes.push("ValueChain RPC did not confirm live status for this refresh.");

  const sodexRoutes = getSodexRoutesForAssets(assets.map((asset) => asset.symbol));
  const [marketResult, whaleResult] = await Promise.allSettled([
    assets.length > 0
      ? getLiveSodexMarketsForAssets(assets.map((asset) => asset.symbol))
      : getLiveSodexMarket().then((market): Record<string, SodexMarket> => ({ BTC: market })),
    assets.length > 0 ? getLiveSodexWhaleEventsForAssets(assets.map((asset) => asset.symbol)) : getLiveSodexWhaleEvents(),
  ]);

  const sodexMarkets: Record<string, SodexMarket> = marketResult.status === "fulfilled" ? marketResult.value : {};
  const sodex = assets[0] ? sodexMarkets[assets[0].symbol] ?? Object.values(sodexMarkets)[0] : Object.values(sodexMarkets)[0];
  if (marketResult.status === "rejected" || !sodex) sourceNotes.push(reason(marketResult.status === "rejected" ? marketResult.reason : undefined, "SoDEX market data unavailable"));

  const whaleEvents = whaleResult.status === "fulfilled" ? whaleResult.value : [];
  if (whaleResult.status === "rejected") sourceNotes.push(reason(whaleResult.reason, "SoDEX trade tape unavailable"));

  const signals = assets.length > 0 ? buildSignals(assets, etfFlows, whaleEvents) : [];
  const aiBrief =
    assets.length > 0
      ? await generateAiBrief({ assets, etfFlows, news, whaleEvents, signals })
      : "Live market sources are not ready yet.";
  config = runtimeConfig();
  if (config.sosovalueRateLimit?.remaining !== undefined && config.sosovalueRateLimit.remaining <= 3) {
    sourceNotes.push("SoSoValue API quota is close to the current minute limit; refreshes are server-throttled.");
  }

  const baseSnapshot: Omit<DashboardSnapshot, "history" | "assetHistory" | "config"> = {
    generatedAt,
    state: sourceNotes.length === 0 && chain?.isLive ? "live" : "partial",
    sourceNotes,
    assets,
    etfFlows,
    indices,
    macro,
    news,
    whaleEvents,
    signals,
    sodex,
    sodexMarkets,
    sodexRoutes,
    chain,
    aiBrief,
    sosoRateLimit: config.sosovalueRateLimit,
  };

  if (persist && assets.length > 0 && sodex && chain) {
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
  const assetHistory = Object.fromEntries(
    assets.map((asset) => {
      const points = history.filter((point) => point.assets.some((item) => item.symbol === asset.symbol));
      return [asset.symbol, points.length > 0 ? points : currentPoint ? [currentPoint] : []];
    })
  );

  if (!config.mongodb) {
    sourceNotes.push("MongoDB persistence is required for production saved state and cross-session signal history.");
  }
  if (!config.walletSessionSecret) {
    sourceNotes.push("WHALEMIND_SESSION_SECRET is required for production wallet-owned sessions.");
  }

  const finalSourceNotes = sourceNotes.length > 0 ? sourceNotes : ["All live dashboard sources responded."];
  const finalState = sourceNotes.length === 0 && chain?.isLive ? "live" : sourceNotes.length < 5 ? "partial" : "unavailable";

  return {
    ...baseSnapshot,
    state: finalState,
    sourceNotes: finalSourceNotes,
    history,
    assetHistory,
    config,
  };
}
