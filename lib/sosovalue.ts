import type { EtfFlow, MarketAsset, NewsItem, SosoIndexConstituent, SosoIndexSnapshot } from "@/lib/whalemind-types";

const SOSO_BASE_URL = process.env.SOSOVALUE_BASE_URL ?? "https://openapi.sosovalue.com/openapi/v1";
const WATCHED_SYMBOLS = ["BTC", "ETH", "SOL", "XRP"];
const SOSO_REQUEST_TIMEOUT_MS = 8000;
const SOSO_RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const WATCHED_INDEX_TICKERS = (process.env.SOSOVALUE_INDEX_TICKERS ?? "ssimag7")
  .split(",")
  .map((ticker) => ticker.trim().toLowerCase())
  .filter(Boolean);

const sosoMemoryCache = new Map<string, { expiresAt: number; data: unknown }>();
const sosoInFlight = new Map<string, Promise<unknown>>();

interface SosoWrapper<T> {
  code: number;
  message: string;
  data: T;
}

interface CurrencyListItem {
  currency_id: string;
  symbol: string;
  name: string;
}

interface CurrencySnapshot {
  price?: number | string;
  change_pct_24h?: number | string;
  turnover_24h?: number | string;
  marketcap?: number | string;
}

interface EtfSummaryItem {
  date: string;
  total_net_inflow?: number | string;
  total_net_assets?: number | string;
  cum_net_inflow?: number | string;
}

interface HotNewsResponse {
  list?: Array<{
    id: string | number;
    title?: string;
    source_link?: string;
    create_time?: number;
  }>;
}

type IndexListItem =
  | string
  | {
  ticker?: string;
  index_ticker?: string;
  name?: string;
  index_name?: string;
  };

interface ResolvedIndexItem {
  ticker: string;
  name: string;
}

interface IndexSnapshotResponse {
  price?: number | string;
  "24h_change_pct"?: number | string;
  "7day_roi"?: number | string;
  "1month_roi"?: number | string;
  "3month_roi"?: number | string;
  "1year_roi"?: number | string;
  ytd?: number | string;
}

interface IndexConstituentResponse {
  currency_id?: string;
  symbol?: string;
  weight?: number | string;
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function makeUrl(path: string, query?: Record<string, string | number | undefined>) {
  const url = new URL(`${SOSO_BASE_URL}${path}`);
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, String(value));
  });
  return url;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sosoGet<T>(
  path: string,
  query?: Record<string, string | number | undefined>,
  revalidate = 30
): Promise<T> {
  const apiKey = process.env.SOSOVALUE_API_KEY;
  if (!apiKey) throw new Error("SOSOVALUE_API_KEY is not configured.");
  const url = makeUrl(path, query);
  const cacheKey = url.toString();
  const now = Date.now();
  const cached = sosoMemoryCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data as T;
  }

  const inFlight = sosoInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight as Promise<T>;
  }

  const request = (async () => {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "x-soso-api-key": apiKey,
        },
        next: { revalidate },
        signal: AbortSignal.timeout(SOSO_REQUEST_TIMEOUT_MS),
      });

      if (response.ok || !SOSO_RETRY_STATUSES.has(response.status) || attempt === 1) break;
      await sleep(350);
    }

    if (!response) {
      throw new Error("SoSoValue request failed: no response");
    }

    if (!response.ok) {
      throw new Error(`SoSoValue request failed: ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as SosoWrapper<T>;
    if (body.code !== 0) {
      throw new Error(`SoSoValue API error: ${body.message || body.code}`);
    }

    sosoMemoryCache.set(cacheKey, {
      expiresAt: Date.now() + revalidate * 1000,
      data: body.data,
    });

    return body.data;
  })();

  sosoInFlight.set(cacheKey, request);
  try {
    return (await request) as T;
  } finally {
    sosoInFlight.delete(cacheKey);
  }
}

export async function getSosoMarketAssets(): Promise<MarketAsset[]> {
  const currencies = await sosoGet<CurrencyListItem[]>("/currencies", undefined, 60);
  const selected = WATCHED_SYMBOLS.map((symbol) => {
    return currencies.find((currency) => currency.symbol.toUpperCase() === symbol);
  }).filter(Boolean) as CurrencyListItem[];

  const snapshots = await Promise.all(
    selected.map(async (currency) => {
      const snapshot = await sosoGet<CurrencySnapshot>(
        `/currencies/${currency.currency_id}/market-snapshot`,
        undefined,
        30
      );

      return {
        symbol: currency.symbol.toUpperCase(),
        name: currency.name,
        price: toNumber(snapshot.price),
        change24h: toNumber(snapshot.change_pct_24h),
        volume24h: toNumber(snapshot.turnover_24h),
        marketCap: toNumber(snapshot.marketcap),
        source: "SoSoValue" as const,
      };
    })
  );

  return snapshots;
}

export async function getSosoEtfFlows(): Promise<EtfFlow[]> {
  const symbols = ["BTC", "ETH"];
  const summaries = await Promise.all(
    symbols.map(async (symbol) => {
      const rows = await sosoGet<EtfSummaryItem[]>(
        "/etfs/summary-history",
        { symbol, country_code: "US", limit: 1 },
        60
      );
      const latest = rows[0];

      return {
        symbol,
        latestDate: latest?.date ?? "n/a",
        netInflow: toNumber(latest?.total_net_inflow),
        cumulativeInflow: toNumber(latest?.cum_net_inflow),
        totalAssets: toNumber(latest?.total_net_assets),
      };
    })
  );

  return summaries;
}

export async function getSosoHotNews(): Promise<NewsItem[]> {
  const news = await sosoGet<HotNewsResponse>(
    "/news/hot",
    { page: 1, page_size: 5, language: "en" },
    30
  );

  return (news.list ?? []).map((item) => ({
    id: String(item.id),
    title: item.title ?? "Untitled SoSoValue update",
    sourceUrl: item.source_link,
    createdAt: item.create_time ? new Date(item.create_time).toISOString() : undefined,
  }));
}

export async function getSosoIndices(): Promise<SosoIndexSnapshot[]> {
  const rawIndices = await sosoGet<IndexListItem[]>("/indices", undefined, 60);
  const indices = rawIndices.map(toIndexListItem).filter(isPresent);
  const selected = WATCHED_INDEX_TICKERS.map((wanted) => {
    return indices.find((index) => index.ticker === wanted);
  })
    .filter(isPresent)
    .slice(0, 4);

  const resolved = selected.length > 0 ? selected : indices.slice(0, 2);
  if (resolved.length === 0) return [];

  return Promise.all(
    resolved.map(async (index) => {
      const ticker = index.ticker;
      const [snapshot, constituents] = await Promise.all([
        sosoGet<IndexSnapshotResponse>(`/indices/${ticker}/market-snapshot`, undefined, 30),
        sosoGet<IndexConstituentResponse[]>(`/indices/${ticker}/constituents`, undefined, 60),
      ]);

      return {
        ticker,
        name: index.name,
        price: toNumber(snapshot.price),
        change24h: toNumber(snapshot["24h_change_pct"]),
        roi7d: toNumber(snapshot["7day_roi"]),
        roi1m: toNumber(snapshot["1month_roi"]),
        roi3m: toNumber(snapshot["3month_roi"]),
        roi1y: toNumber(snapshot["1year_roi"]),
        ytd: toNumber(snapshot.ytd),
        constituents: constituents.map(toIndexConstituent).filter(Boolean) as SosoIndexConstituent[],
      };
    })
  );
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function toIndexListItem(index: IndexListItem): ResolvedIndexItem | undefined {
  const ticker =
    typeof index === "string" ? index.trim().toLowerCase() : String(index.index_ticker ?? index.ticker ?? "").trim().toLowerCase();

  if (!ticker) return undefined;

  return {
    ticker,
    name: typeof index === "string" ? ticker.toUpperCase() : index.name ?? index.index_name ?? ticker.toUpperCase(),
  };
}

function toIndexConstituent(item: IndexConstituentResponse): SosoIndexConstituent | undefined {
  const symbol = String(item.symbol ?? "").trim().toUpperCase();
  if (!symbol) return undefined;

  return {
    currencyId: String(item.currency_id ?? ""),
    symbol,
    weight: toNumber(item.weight),
  };
}
