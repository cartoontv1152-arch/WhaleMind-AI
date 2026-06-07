export type TradeAction = "BUY" | "SELL" | "HOLD" | "WATCH";

export type DataSourceState = "live" | "fallback" | "partial";

export interface MarketAsset {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  source: "SoSoValue" | "Fallback";
}

export interface EtfFlow {
  symbol: string;
  latestDate: string;
  netInflow: number;
  cumulativeInflow: number;
  totalAssets: number;
}

export interface NewsItem {
  id: string;
  title: string;
  sourceUrl?: string;
  createdAt?: string;
}

export interface SosoIndexConstituent {
  currencyId: string;
  symbol: string;
  weight: number;
}

export interface SosoIndexSnapshot {
  ticker: string;
  name: string;
  price: number;
  change24h: number;
  roi7d: number;
  roi1m: number;
  roi3m: number;
  roi1y: number;
  ytd: number;
  constituents: SosoIndexConstituent[];
}

export interface WhaleEvent {
  id: string;
  asset: string;
  direction: "accumulation" | "distribution" | "rotation" | "hedge";
  notionalUsd: number;
  confidence: number;
  summary: string;
  source: "SoDEX order book" | "ValueChain" | "Simulated fallback";
  timestamp: string;
}

export interface AiSignal {
  id: string;
  asset: string;
  action: TradeAction;
  confidence: number;
  risk: "low" | "medium" | "high";
  thesis: string;
  drivers: string[];
}

export interface ChainStatus {
  chainId: number;
  chainName: string;
  blockNumber?: number;
  rpcUrl: string;
  explorerUrl: string;
  isLive: boolean;
  error?: string;
}

export interface SodexMarket {
  environment: "mainnet" | "testnet";
  symbol: string;
  lastPrice?: number;
  priceChange24h?: number;
  volume24h?: number;
  bid?: number;
  ask?: number;
  source: "SoDEX" | "Fallback";
}

export interface WhaleMindSnapshot {
  generatedAt: string;
  state: DataSourceState;
  sourceNotes: string[];
  assets: MarketAsset[];
  etfFlows: EtfFlow[];
  indices: SosoIndexSnapshot[];
  news: NewsItem[];
  whaleEvents: WhaleEvent[];
  signals: AiSignal[];
  sodex: SodexMarket;
  chain: ChainStatus;
  aiBrief: string;
}

export interface RuntimeConfigStatus {
  sosovalueApi: boolean;
  openaiApi: boolean;
  mongodb: boolean;
  mongodbRequired: boolean;
  walletSessionSecret: boolean;
  sodexEnvironment: "mainnet" | "testnet";
  sodexAccountId: boolean;
  sodexApiKeyName: boolean;
  sodexVerifyingContract: boolean;
  sodexLiveExecution: boolean;
  alertDelivery: {
    telegram: boolean;
    discord: boolean;
  };
}

export interface DashboardHistoryPoint {
  generatedAt: string;
  assets: Array<Pick<MarketAsset, "symbol" | "price" | "change24h" | "volume24h" | "marketCap">>;
  signals: Array<Pick<AiSignal, "asset" | "action" | "confidence">>;
  indices?: Array<Pick<SosoIndexSnapshot, "ticker" | "name" | "price" | "change24h" | "roi7d" | "roi1m" | "roi3m" | "ytd">>;
  sodex?: Pick<SodexMarket, "symbol" | "lastPrice" | "priceChange24h" | "volume24h" | "bid" | "ask">;
  chain?: Pick<ChainStatus, "blockNumber">;
}

export interface DashboardSnapshot {
  generatedAt: string;
  state: Exclude<DataSourceState, "fallback">;
  sourceNotes: string[];
  assets: MarketAsset[];
  etfFlows: EtfFlow[];
  indices: SosoIndexSnapshot[];
  news: NewsItem[];
  whaleEvents: WhaleEvent[];
  signals: AiSignal[];
  sodex?: SodexMarket;
  chain?: ChainStatus;
  aiBrief?: string;
  history: DashboardHistoryPoint[];
  assetHistory: Record<string, DashboardHistoryPoint[]>;
  config: RuntimeConfigStatus;
}

export interface OrderIntentInput {
  walletAddress: string;
  accountId?: number;
  apiKeyName?: string;
  symbol?: string;
  side: "BUY" | "SELL";
  notionalUsd: number;
  orderType?: "MARKET" | "LIMIT";
  limitPrice?: number;
}

export interface OrderIntent {
  clOrdID: string;
  endpoint: string;
  method: "POST";
  walletAddress: string;
  signingMode: "master-wallet" | "registered-api-key";
  apiKeyName?: string;
  nonce: number;
  payload: Record<string, unknown>;
  payloadHash: string;
  typedData: {
    domain: {
      name: "spot" | "futures";
      version: "1";
      chainId: number;
      verifyingContract: string;
    };
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: "ExchangeAction";
    message: {
      payloadHash: string;
      nonce: number;
    };
  };
  headersPreview: {
    "Content-Type": "application/json";
    Accept: "application/json";
    "X-API-Key"?: string;
    "X-API-Nonce": string;
  };
  executionMode: "dry-run" | "ready-for-signature";
  serverProof: string;
  warnings: string[];
}

export interface SavedSignal {
  id: string;
  savedAt: string;
  signal: AiSignal;
  sourceGeneratedAt: string;
  note?: string;
}

export interface WatchlistItem {
  symbol: string;
  addedAt: string;
}

export type AlertChannel = "in-app" | "telegram" | "discord";

export interface UserAlert {
  id: string;
  asset: string;
  minConfidence: number;
  action: TradeAction | "ANY";
  channel: AlertChannel;
  destination?: string;
  enabled: boolean;
  createdAt: string;
  lastTriggeredAt?: string;
  lastTriggeredSignalId?: string;
}

export interface PortfolioHolding {
  id: string;
  asset: string;
  quantity: number;
  averageCostUsd: number;
  updatedAt: string;
}

export interface BacktestResult {
  id: string;
  asset: string;
  action: TradeAction;
  createdAt: string;
  lookbackPoints: number;
  positionUsd: number;
  entryPrice: number;
  exitPrice: number;
  stopLossPct: number;
  takeProfitPct: number;
  estimatedPnlUsd: number;
  estimatedPnlPct: number;
  maxDrawdownPct: number;
  riskReward: number;
  result: "take-profit" | "stop-loss" | "open";
}

export interface UserBetaState {
  walletAddress: string;
  authenticated: boolean;
  updatedAt: string;
  watchlist: WatchlistItem[];
  savedSignals: SavedSignal[];
  alerts: UserAlert[];
  portfolio: PortfolioHolding[];
  backtests: BacktestResult[];
}

export interface WalletChallenge {
  walletAddress: string;
  nonce: string;
  message: string;
  expiresAt: string;
}
