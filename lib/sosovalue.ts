import type { EtfFlow, MarketAsset, NewsItem } from "@/lib/whalemind-types";

const SOSO_BASE_URL = process.env.SOSOVALUE_BASE_URL ?? "https://openapi.sosovalue.com/openapi/v1";
const WATCHED_SYMBOLS = ["BTC", "ETH", "SOL", "XRP"];

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

export async function sosoGet<T>(
  path: string,
  query?: Record<string, string | number | undefined>,
  revalidate = 30
): Promise<T> {
  const apiKey = process.env.SOSOVALUE_API_KEY;
  if (!apiKey) throw new Error("SOSOVALUE_API_KEY is not configured.");

  const response = await fetch(makeUrl(path, query), {
    headers: {
      Accept: "application/json",
      "x-soso-api-key": apiKey,
    },
    next: { revalidate },
  });

  if (!response.ok) {
    throw new Error(`SoSoValue request failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as SosoWrapper<T>;
  if (body.code !== 0) {
    throw new Error(`SoSoValue API error: ${body.message || body.code}`);
  }

  return body.data;
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
