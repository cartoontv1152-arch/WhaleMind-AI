import type {
  EtfFlow,
  MacroEventDay,
  MacroEventHistoryPoint,
  MacroEventInsight,
  MarketAsset,
  NewsItem,
  SosoIndexConstituent,
  SosoIndexKline,
  SosoIndexSnapshot,
  SosoMacroSnapshot,
  SosoRateLimitStatus,
} from "@/lib/whalemind-types";

const SOSO_BASE_URL = process.env.SOSOVALUE_BASE_URL ?? "https://openapi.sosovalue.com/openapi/v1";
const SOSO_REQUEST_TIMEOUT_MS = 8000;
const SOSO_RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const SOSO_REFRESH_SECONDS = clampInteger(Number(process.env.SOSOVALUE_REFRESH_SECONDS), 60, 3600, 60);
const SOSO_STALE_SECONDS = clampInteger(Number(process.env.SOSOVALUE_STALE_SECONDS), SOSO_REFRESH_SECONDS, 86_400, 900);
const WATCHED_SYMBOLS = parseCsv(process.env.SOSOVALUE_MARKET_SYMBOLS, ["BTC", "ETH", "SOL", "XRP"], (symbol) =>
  symbol.toUpperCase()
).slice(0, 6);
const ETF_FLOW_SYMBOLS = parseCsv(process.env.SOSOVALUE_ETF_SYMBOLS, ["BTC", "ETH"], (symbol) => symbol.toUpperCase()).slice(0, 4);
const WATCHED_INDEX_TICKERS = parseCsv(process.env.SOSOVALUE_INDEX_TICKERS, ["ssimag7"])
  .map((ticker) => ticker.toLowerCase())
  .slice(0, 3);
const TRACKED_MACRO_EVENTS = parseCsv(process.env.SOSOVALUE_MACRO_EVENTS, ["CPI", "Nonfarm Payrolls"]).slice(0, 3);

const sosoMemoryCache = new Map<string, { expiresAt: number; staleUntil: number; data: unknown }>();
const sosoInFlight = new Map<string, Promise<unknown>>();
let sosoCooldownUntil = 0;
let sosoRateLimitStatus: SosoRateLimitStatus = {};

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
    create_time?: number | string;
    release_time?: number | string;
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

interface IndexKlineResponse {
  timestamp?: number | string;
  open?: number | string;
  high?: number | string;
  low?: number | string;
  close?: number | string;
}

interface MacroEventDayResponse {
  date?: string;
  events?: string[];
}

interface MacroEventHistoryResponse {
  date?: string;
  actual?: number | string;
  forecast?: number | string;
  previous?: number | string;
}

interface RateLimitErrorBody {
  details?: {
    retry_after?: number | string;
  };
}

function clampInteger(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function parseCsv(value: string | undefined, fallback: string[], transform: (value: string) => string = (item) => item) {
  const parsed = (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return (parsed.length > 0 ? parsed : fallback).map(transform);
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

function updateRateLimitStatus(response: Response) {
  const limit = toOptionalNumber(response.headers.get("X-RateLimit-Limit"));
  const remaining = toOptionalNumber(response.headers.get("X-RateLimit-Remaining"));
  const resetMs = toOptionalNumber(response.headers.get("X-RateLimit-Reset"));

  sosoRateLimitStatus = {
    ...sosoRateLimitStatus,
    ...(limit !== undefined ? { limit } : {}),
    ...(remaining !== undefined ? { remaining } : {}),
    ...(resetMs !== undefined ? { resetAt: new Date(resetMs).toISOString() } : {}),
    ...(sosoCooldownUntil > Date.now() ? { cooldownUntil: new Date(sosoCooldownUntil).toISOString() } : {}),
    lastUpdatedAt: new Date().toISOString(),
  };
}

function toOptionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toTimestampIso(value: unknown) {
  const timestamp = toOptionalNumber(value);
  if (timestamp === undefined) return undefined;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

async function registerRateLimitCooldown(response: Response) {
  const body = (await response.clone().json().catch(() => undefined)) as RateLimitErrorBody | undefined;
  const retryAfterSeconds = toOptionalNumber(response.headers.get("Retry-After")) ?? toOptionalNumber(body?.details?.retry_after);
  const resetMs = toOptionalNumber(response.headers.get("X-RateLimit-Reset"));
  const retryMs =
    retryAfterSeconds !== undefined
      ? retryAfterSeconds * 1000
      : resetMs !== undefined
        ? Math.max(0, resetMs - Date.now())
        : 60_000;

  sosoCooldownUntil = Date.now() + Math.max(1000, retryMs);
  updateRateLimitStatus(response);
}

export function getSosoRateLimitStatus(): SosoRateLimitStatus {
  return {
    ...sosoRateLimitStatus,
    ...(sosoCooldownUntil > Date.now() ? { cooldownUntil: new Date(sosoCooldownUntil).toISOString() } : {}),
  };
}

export function getSosoRefreshSeconds() {
  return SOSO_REFRESH_SECONDS;
}

export async function sosoGet<T>(
  path: string,
  query?: Record<string, string | number | undefined>,
  revalidate = SOSO_REFRESH_SECONDS
): Promise<T> {
  const apiKey = process.env.SOSOVALUE_API_KEY;
  if (!apiKey) throw new Error("SOSOVALUE_API_KEY is not configured.");
  const url = makeUrl(path, query);
  const cacheKey = url.toString();
  const now = Date.now();
  const cacheSeconds = Math.max(revalidate, SOSO_REFRESH_SECONDS);
  const cached = sosoMemoryCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data as T;
  }

  if (sosoCooldownUntil > now) {
    if (cached && cached.staleUntil > now) return cached.data as T;
    throw new Error(`SoSoValue rate limit cooldown active until ${new Date(sosoCooldownUntil).toISOString()}.`);
  }

  const inFlight = sosoInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight as Promise<T>;
  }

  const request = (async () => {
    let response: Response | undefined;
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        response = await fetch(url, {
          headers: {
            Accept: "application/json",
            "x-soso-api-key": apiKey,
          },
          next: { revalidate: cacheSeconds },
          signal: AbortSignal.timeout(SOSO_REQUEST_TIMEOUT_MS),
        });
        updateRateLimitStatus(response);

        if (response.status === 429) {
          await registerRateLimitCooldown(response);
          break;
        }

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
        expiresAt: Date.now() + cacheSeconds * 1000,
        staleUntil: Date.now() + Math.max(cacheSeconds, SOSO_STALE_SECONDS) * 1000,
        data: body.data,
      });

      return body.data;
    } catch (error) {
      if (cached && cached.staleUntil > Date.now()) return cached.data as T;
      throw error;
    }
  })();

  sosoInFlight.set(cacheKey, request);
  try {
    return (await request) as T;
  } finally {
    sosoInFlight.delete(cacheKey);
  }
}

export async function getSosoMarketAssets(): Promise<MarketAsset[]> {
  const currencies = await sosoGet<CurrencyListItem[]>("/currencies", undefined, 300);
  const selected = WATCHED_SYMBOLS.map((symbol) => {
    return currencies.find((currency) => currency.symbol.toUpperCase() === symbol);
  }).filter(Boolean) as CurrencyListItem[];

  const snapshots = await Promise.all(
    selected.map(async (currency) => {
      const snapshot = await sosoGet<CurrencySnapshot>(
        `/currencies/${currency.currency_id}/market-snapshot`,
        undefined,
        SOSO_REFRESH_SECONDS
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
  const summaries = await Promise.all(
    ETF_FLOW_SYMBOLS.map(async (symbol) => {
      const rows = await sosoGet<EtfSummaryItem[]>(
        "/etfs/summary-history",
        { symbol, country_code: "US", limit: 1 },
        300
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
    SOSO_REFRESH_SECONDS
  );

  return (news.list ?? []).map((item) => ({
    id: String(item.id),
    title: item.title ?? "Untitled SoSoValue update",
    sourceUrl: item.source_link,
    createdAt: toTimestampIso(item.release_time ?? item.create_time),
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
      const [snapshot, constituents, klines] = await Promise.all([
        sosoGet<IndexSnapshotResponse>(`/indices/${ticker}/market-snapshot`, undefined, SOSO_REFRESH_SECONDS),
        sosoGet<IndexConstituentResponse[]>(`/indices/${ticker}/constituents`, undefined, 300),
        sosoGet<IndexKlineResponse[]>(`/indices/${ticker}/klines`, { interval: "1d", limit: 30 }, 300),
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
        klines: klines.map(toIndexKline).filter(Boolean) as SosoIndexKline[],
      };
    })
  );
}

export async function getSosoMacroEvents(): Promise<SosoMacroSnapshot> {
  const rawDays = await sosoGet<MacroEventDayResponse[]>("/macro/events", undefined, 300);
  const days = rawDays.map(toMacroEventDay).filter(Boolean) as MacroEventDay[];
  const eventNames = Array.from(new Set(days.flatMap((day) => day.events)));
  const resolvedTrackedEvents = TRACKED_MACRO_EVENTS.map((wanted) => {
    return eventNames.find((event) => event.toLowerCase() === wanted.toLowerCase());
  }).filter(Boolean) as string[];
  const trackedEvents = (resolvedTrackedEvents.length > 0 ? resolvedTrackedEvents : eventNames.slice(0, 1)).slice(0, 1);

  const trackedResults = await Promise.allSettled(
    trackedEvents.map(async (event): Promise<MacroEventInsight> => {
      const history = await sosoGet<MacroEventHistoryResponse[]>(
        `/macro/events/${encodeURIComponent(event)}/history`,
        { limit: 20 },
        300
      );
      const normalizedHistory = history.map(toMacroHistoryPoint).filter(Boolean) as MacroEventHistoryPoint[];

      return {
        event,
        latest: normalizedHistory[0],
        history: normalizedHistory,
      };
    })
  );
  const tracked = trackedResults
    .filter((result): result is PromiseFulfilledResult<MacroEventInsight> => result.status === "fulfilled")
    .map((result) => result.value);

  return {
    days: days.slice(0, 8),
    tracked,
  };
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

function toIndexKline(item: IndexKlineResponse): SosoIndexKline | undefined {
  const timestamp = toNumber(item.timestamp, Number.NaN);
  if (!Number.isFinite(timestamp)) return undefined;

  return {
    timestamp,
    open: toNumber(item.open),
    high: toNumber(item.high),
    low: toNumber(item.low),
    close: toNumber(item.close),
  };
}

function toMacroEventDay(item: MacroEventDayResponse): MacroEventDay | undefined {
  const date = String(item.date ?? "").trim();
  if (!date) return undefined;

  return {
    date,
    events: Array.isArray(item.events) ? item.events.map((event) => String(event).trim()).filter(Boolean) : [],
  };
}

function toMacroHistoryPoint(item: MacroEventHistoryResponse): MacroEventHistoryPoint | undefined {
  const date = String(item.date ?? "").trim();
  if (!date) return undefined;

  return {
    date,
    actual: toOptionalNumber(item.actual),
    forecast: toOptionalNumber(item.forecast),
    previous: toOptionalNumber(item.previous),
  };
}
