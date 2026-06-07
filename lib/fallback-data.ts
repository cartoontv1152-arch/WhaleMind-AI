import type {
  AiSignal,
  ChainStatus,
  EtfFlow,
  MarketAsset,
  NewsItem,
  SodexMarket,
  WhaleEvent,
  WhaleMindSnapshot,
} from "@/lib/whalemind-types";

const nowIso = () => new Date().toISOString();

export const fallbackAssets: MarketAsset[] = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    price: 78000,
    change24h: 1.8,
    volume24h: 42_000_000_000,
    marketCap: 1_540_000_000_000,
    source: "Fallback",
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    price: 2300,
    change24h: -0.7,
    volume24h: 18_000_000_000,
    marketCap: 277_000_000_000,
    source: "Fallback",
  },
  {
    symbol: "SOL",
    name: "Solana",
    price: 85,
    change24h: 0.4,
    volume24h: 3_600_000_000,
    marketCap: 45_000_000_000,
    source: "Fallback",
  },
  {
    symbol: "XRP",
    name: "XRP",
    price: 0.52,
    change24h: 0.9,
    volume24h: 2_200_000_000,
    marketCap: 29_000_000_000,
    source: "Fallback",
  },
];

export const fallbackEtfFlows: EtfFlow[] = [
  {
    symbol: "BTC",
    latestDate: "latest",
    netInflow: 153_870_000,
    cumulativeInflow: 18_400_000_000,
    totalAssets: 76_000_000_000,
  },
  {
    symbol: "ETH",
    latestDate: "latest",
    netInflow: -82_470_000,
    cumulativeInflow: 2_900_000_000,
    totalAssets: 9_800_000_000,
  },
];

export const fallbackNews: NewsItem[] = [
  {
    id: "fallback-btc-etf-flow",
    title: "BTC ETF demand remains the primary institutional flow to watch.",
    sourceUrl: "https://sosovalue.com",
  },
  {
    id: "fallback-sodex-mainnet",
    title: "SoDEX order-book trading gives signals a direct research-to-execution path.",
    sourceUrl: "https://sodex.com",
  },
  {
    id: "fallback-risk",
    title: "Altcoin momentum is mixed; WhaleMind keeps execution behind wallet confirmation.",
  },
];

export function buildFallbackWhaleEvents(generatedAt = nowIso()): WhaleEvent[] {
  return [
    {
      id: "fallback-vbtc-accumulation",
      asset: "BTC",
      direction: "accumulation",
      notionalUsd: 3_240_000,
      confidence: 82,
      summary: "Large vBTC/vUSDC order-book demand is modeled as accumulation until live SoDEX prints load.",
      source: "Simulated fallback",
      timestamp: generatedAt,
    },
    {
      id: "fallback-eth-hedge",
      asset: "ETH",
      direction: "hedge",
      notionalUsd: 1_120_000,
      confidence: 68,
      summary: "ETH flow is treated cautiously because ETF pressure offsets broader market bid.",
      source: "Simulated fallback",
      timestamp: generatedAt,
    },
    {
      id: "fallback-sol-rotation",
      asset: "SOL",
      direction: "rotation",
      notionalUsd: 740_000,
      confidence: 61,
      summary: "SOL remains a watchlist rotation candidate while liquidity stays below BTC/ETH.",
      source: "Simulated fallback",
      timestamp: generatedAt,
    },
  ];
}

export const fallbackSignals: AiSignal[] = [
  {
    id: "fallback-btc-buy",
    asset: "BTC",
    action: "BUY",
    confidence: 84,
    risk: "medium",
    thesis: "Institutional flow and order-book demand are aligned enough for a measured long bias.",
    drivers: ["Positive ETF net inflow", "Strong ValueChain execution route", "High market depth"],
  },
  {
    id: "fallback-eth-hold",
    asset: "ETH",
    action: "HOLD",
    confidence: 63,
    risk: "medium",
    thesis: "ETH has liquidity, but recent fund-flow weakness makes confirmation more important than speed.",
    drivers: ["ETF outflows", "Mixed momentum", "Trade only after order-book confirmation"],
  },
  {
    id: "fallback-sol-watch",
    asset: "SOL",
    action: "WATCH",
    confidence: 58,
    risk: "high",
    thesis: "SOL can rotate quickly, but the signal needs stronger flow before WhaleMind escalates to buy.",
    drivers: ["Narrative beta", "Lower ETF participation", "Higher volatility"],
  },
];

export function fallbackChainStatus(): ChainStatus {
  return {
    chainId: 286623,
    chainName: "ValueChain",
    rpcUrl: "https://mainnet.valuechain.xyz",
    explorerUrl: "https://main-scan.valuechain.xyz",
    isLive: false,
    error: "Using fallback chain status until RPC responds.",
  };
}

export function fallbackSodexMarket(): SodexMarket {
  return {
    environment: "mainnet",
    symbol: "vBTC_vUSDC",
    lastPrice: 78_000,
    priceChange24h: 1.6,
    volume24h: 28_500_000,
    bid: 77_980,
    ask: 78_020,
    source: "Fallback",
  };
}

export function buildFallbackSnapshot(reason = "Live providers are not configured yet."): WhaleMindSnapshot {
  const generatedAt = nowIso();

  return {
    generatedAt,
    state: "fallback",
    sourceNotes: [reason],
    assets: fallbackAssets,
    etfFlows: fallbackEtfFlows,
    indices: [],
    news: fallbackNews,
    whaleEvents: buildFallbackWhaleEvents(generatedAt),
    signals: fallbackSignals,
    sodex: fallbackSodexMarket(),
    chain: fallbackChainStatus(),
    aiBrief:
      "WhaleMind is running in protected fallback mode: signals are deterministic, the SoDEX route is dry-run only, and live execution unlocks after API, wallet, and signing credentials are configured.",
  };
}
