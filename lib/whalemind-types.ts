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
  sodexAccountId: boolean;
  sodexVerifyingContract: boolean;
  sodexLiveExecution: boolean;
}

export interface DashboardHistoryPoint {
  generatedAt: string;
  assets: Array<Pick<MarketAsset, "symbol" | "price" | "change24h" | "volume24h" | "marketCap">>;
  signals: Array<Pick<AiSignal, "asset" | "action" | "confidence">>;
  sodex?: Pick<SodexMarket, "symbol" | "lastPrice" | "priceChange24h" | "volume24h" | "bid" | "ask">;
  chain?: Pick<ChainStatus, "blockNumber">;
}

export interface DashboardSnapshot {
  generatedAt: string;
  state: Exclude<DataSourceState, "fallback">;
  sourceNotes: string[];
  assets: MarketAsset[];
  etfFlows: EtfFlow[];
  news: NewsItem[];
  whaleEvents: WhaleEvent[];
  signals: AiSignal[];
  sodex?: SodexMarket;
  chain?: ChainStatus;
  aiBrief?: string;
  history: DashboardHistoryPoint[];
  config: RuntimeConfigStatus;
}

export interface OrderIntentInput {
  walletAddress: string;
  accountId?: number;
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
    "X-API-Key": string;
    "X-API-Nonce": string;
  };
  executionMode: "dry-run" | "ready-for-signature";
  warnings: string[];
}
