import { randomUUID } from "crypto";

import type {
  AiSignal,
  BacktestResult,
  DashboardHistoryPoint,
  PortfolioHolding,
  SavedSignal,
  TradeAction,
  UserAlert,
  UserBetaState,
  WatchlistItem,
} from "@/lib/whalemind-types";

const MAX_SAVED_SIGNALS = 50;
const MAX_BACKTESTS = 30;
const ALERT_COOLDOWN_MS = 15 * 60 * 1000;

function stateId(prefix: string, asset: string) {
  return `${prefix}-${asset.trim().toLowerCase()}-${randomUUID()}`;
}

export function normalizeWalletAddress(walletAddress: string) {
  return walletAddress.trim().toLowerCase();
}

export function createDefaultUserBetaState(walletAddress: string): UserBetaState {
  return {
    walletAddress: normalizeWalletAddress(walletAddress),
    authenticated: false,
    updatedAt: new Date().toISOString(),
    watchlist: [],
    savedSignals: [],
    alerts: [],
    portfolio: [],
    backtests: [],
  };
}

export function sanitizeUserBetaState(state: Partial<UserBetaState> & { walletAddress: string }): UserBetaState {
  const fallback = createDefaultUserBetaState(state.walletAddress);

  return {
    walletAddress: normalizeWalletAddress(state.walletAddress),
    authenticated: Boolean(state.authenticated),
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : fallback.updatedAt,
    watchlist: Array.isArray(state.watchlist) ? state.watchlist.map(sanitizeWatchlistItem).filter(isPresent) : [],
    savedSignals: Array.isArray(state.savedSignals)
      ? state.savedSignals.map(sanitizeSavedSignal).filter(isPresent).slice(0, MAX_SAVED_SIGNALS)
      : [],
    alerts: Array.isArray(state.alerts) ? state.alerts.map(sanitizeAlert).filter(isPresent) : [],
    portfolio: Array.isArray(state.portfolio) ? state.portfolio.map(sanitizeHolding).filter(isPresent) : [],
    backtests: Array.isArray(state.backtests)
      ? state.backtests.map(sanitizeBacktest).filter(isPresent).slice(0, MAX_BACKTESTS)
      : [],
  };
}

export function mergeUserBetaState(current: UserBetaState, next: UserBetaState): UserBetaState {
  return sanitizeUserBetaState({
    ...next,
    walletAddress: current.walletAddress,
    authenticated: current.authenticated || next.authenticated,
    updatedAt: new Date().toISOString(),
  });
}

export function saveSignalToState(state: UserBetaState, signal: AiSignal, sourceGeneratedAt: string): UserBetaState {
  const saved: SavedSignal = {
    id: stateId("signal", signal.asset),
    savedAt: new Date().toISOString(),
    signal,
    sourceGeneratedAt,
  };

  return sanitizeUserBetaState({
    ...state,
    updatedAt: saved.savedAt,
    savedSignals: [saved, ...state.savedSignals.filter((item) => item.signal.asset !== signal.asset)].slice(
      0,
      MAX_SAVED_SIGNALS
    ),
  });
}

export function toggleWatchlistSymbol(state: UserBetaState, symbol: string): UserBetaState {
  const normalized = symbol.trim().toUpperCase();
  const exists = state.watchlist.some((item) => item.symbol === normalized);
  const watchlist = exists
    ? state.watchlist.filter((item) => item.symbol !== normalized)
    : [{ symbol: normalized, addedAt: new Date().toISOString() }, ...state.watchlist];

  return sanitizeUserBetaState({
    ...state,
    updatedAt: new Date().toISOString(),
    watchlist,
  });
}

export function upsertAlert(state: UserBetaState, alert: UserAlert): UserBetaState {
  const updated = sanitizeAlert(alert);
  if (!updated) return state;

  return sanitizeUserBetaState({
    ...state,
    updatedAt: new Date().toISOString(),
    alerts: [updated, ...state.alerts.filter((item) => item.id !== updated.id)],
  });
}

export function upsertHolding(state: UserBetaState, holding: PortfolioHolding): UserBetaState {
  const updated = sanitizeHolding(holding);
  if (!updated) return state;

  return sanitizeUserBetaState({
    ...state,
    updatedAt: new Date().toISOString(),
    portfolio: [updated, ...state.portfolio.filter((item) => item.id !== updated.id)],
  });
}

export function appendBacktest(state: UserBetaState, result: BacktestResult): UserBetaState {
  return sanitizeUserBetaState({
    ...state,
    updatedAt: new Date().toISOString(),
    backtests: [result, ...state.backtests].slice(0, MAX_BACKTESTS),
  });
}

export function runSignalBacktest({
  signal,
  history,
  positionUsd,
  stopLossPct,
  takeProfitPct,
}: {
  signal: AiSignal;
  history: DashboardHistoryPoint[];
  positionUsd: number;
  stopLossPct: number;
  takeProfitPct: number;
}): BacktestResult {
  const prices = history
    .map((point) => point.assets.find((asset) => asset.symbol === signal.asset)?.price)
    .filter((price): price is number => typeof price === "number" && Number.isFinite(price) && price > 0);

  const entryPrice = prices[0] ?? 0;
  const exitPrice = prices.at(-1) ?? entryPrice;
  const direction = signal.action === "SELL" ? -1 : 1;
  const estimatedPnlPct = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 * direction : 0;
  const estimatedPnlUsd = (positionUsd * estimatedPnlPct) / 100;
  const drawdowns = prices.map((price) => (entryPrice > 0 ? ((price - entryPrice) / entryPrice) * 100 * direction : 0));
  const maxDrawdownPct = Math.min(0, ...drawdowns);
  const result =
    estimatedPnlPct >= takeProfitPct ? "take-profit" : estimatedPnlPct <= -Math.abs(stopLossPct) ? "stop-loss" : "open";

  return {
    id: stateId("backtest", signal.asset),
    asset: signal.asset,
    action: signal.action,
    createdAt: new Date().toISOString(),
    lookbackPoints: prices.length,
    positionUsd,
    entryPrice,
    exitPrice,
    stopLossPct: Math.abs(stopLossPct),
    takeProfitPct: Math.abs(takeProfitPct),
    estimatedPnlUsd,
    estimatedPnlPct,
    maxDrawdownPct,
    riskReward: Math.abs(takeProfitPct) / Math.max(Math.abs(stopLossPct), 0.01),
    result,
  };
}

export function evaluateAlerts(state: UserBetaState, signals: AiSignal[]) {
  const triggeredAt = new Date().toISOString();
  const triggered: UserAlert[] = [];
  const alerts = state.alerts.map((alert) => {
    if (!alert.enabled) return alert;
    const signal = signals.find((item) => item.asset === alert.asset);
    if (!signal) return alert;
    const actionMatches = alert.action === "ANY" || alert.action === signal.action;
    const confidenceMatches = signal.confidence >= alert.minConfidence;
    const alreadyTriggered = alert.lastTriggeredSignalId === signal.id;
    const recentlyTriggered =
      alert.lastTriggeredAt !== undefined && Date.parse(alert.lastTriggeredAt) > Date.now() - ALERT_COOLDOWN_MS;

    if (!actionMatches || !confidenceMatches || alreadyTriggered || recentlyTriggered) return alert;

    const updated = {
      ...alert,
      lastTriggeredAt: triggeredAt,
      lastTriggeredSignalId: signal.id,
    };
    triggered.push(updated);
    return updated;
  });

  return {
    state: sanitizeUserBetaState({
      ...state,
      updatedAt: triggered.length > 0 ? triggeredAt : state.updatedAt,
      alerts,
    }),
    triggered,
  };
}

function sanitizeWatchlistItem(item: unknown): WatchlistItem | undefined {
  if (!item || typeof item !== "object" || !("symbol" in item)) return undefined;
  const symbol = String(item.symbol).trim().toUpperCase();
  if (!symbol) return undefined;
  const addedAt = "addedAt" in item && typeof item.addedAt === "string" ? item.addedAt : new Date().toISOString();
  return { symbol, addedAt };
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function sanitizeSavedSignal(item: unknown): SavedSignal | undefined {
  if (!item || typeof item !== "object" || !("signal" in item)) return undefined;
  const saved = item as SavedSignal;
  if (!saved.signal?.asset) return undefined;
  return {
    id: saved.id || stateId("signal", saved.signal.asset),
    savedAt: saved.savedAt || new Date().toISOString(),
    signal: saved.signal,
    sourceGeneratedAt: saved.sourceGeneratedAt || saved.savedAt || new Date().toISOString(),
    note: saved.note,
  };
}

function sanitizeAlert(item: unknown): UserAlert | undefined {
  if (!item || typeof item !== "object" || !("asset" in item)) return undefined;
  const alert = item as UserAlert;
  const action = (["BUY", "SELL", "HOLD", "WATCH", "ANY"] as Array<TradeAction | "ANY">).includes(alert.action)
    ? alert.action
    : "ANY";
  const channel = (["in-app", "telegram", "discord"] as const).includes(alert.channel) ? alert.channel : "in-app";

  return {
    id: alert.id || stateId("alert", String(alert.asset)),
    asset: String(alert.asset).trim().toUpperCase(),
    minConfidence: Math.min(99, Math.max(1, Number(alert.minConfidence) || 75)),
    action,
    channel,
    destination: alert.destination,
    enabled: alert.enabled !== false,
    createdAt: alert.createdAt || new Date().toISOString(),
    lastTriggeredAt: alert.lastTriggeredAt,
    lastTriggeredSignalId: alert.lastTriggeredSignalId,
  };
}

function sanitizeHolding(item: unknown): PortfolioHolding | undefined {
  if (!item || typeof item !== "object" || !("asset" in item)) return undefined;
  const holding = item as PortfolioHolding;
  const quantity = Number(holding.quantity);
  const averageCostUsd = Number(holding.averageCostUsd);
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(averageCostUsd) || averageCostUsd < 0) {
    return undefined;
  }

  return {
    id: holding.id || stateId("holding", String(holding.asset)),
    asset: String(holding.asset).trim().toUpperCase(),
    quantity,
    averageCostUsd,
    updatedAt: holding.updatedAt || new Date().toISOString(),
  };
}

function sanitizeBacktest(item: unknown): BacktestResult | undefined {
  if (!item || typeof item !== "object" || !("asset" in item)) return undefined;
  const result = item as BacktestResult;
  if (!Number.isFinite(Number(result.positionUsd))) return undefined;
  return result;
}
