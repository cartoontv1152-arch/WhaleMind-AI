import { isAddress } from "ethers";
import { NextResponse } from "next/server";

import { deliverTriggeredAlerts } from "@/lib/alert-delivery";
import { getDashboardHistory, getUserBetaState, saveUserBetaState } from "@/lib/db";
import {
  appendBacktest,
  createDefaultUserBetaState,
  evaluateAlerts,
  mergeUserBetaState,
  normalizeWalletAddress,
  runSignalBacktest,
  saveSignalToState,
  toggleWatchlistSymbol,
  upsertAlert,
  upsertHolding,
} from "@/lib/user-state";
import { readWalletSession } from "@/lib/wallet-session";
import type {
  AiSignal,
  DashboardHistoryPoint,
  PortfolioHolding,
  UserAlert,
  UserBetaState,
} from "@/lib/whalemind-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireWalletSession(walletAddress: string) {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  const session = await readWalletSession();

  if (!session) {
    return {
      response: NextResponse.json({ error: "Wallet session required. Sign the beta challenge first." }, { status: 401 }),
    };
  }

  if (session.walletAddress !== normalizedWallet) {
    return {
      response: NextResponse.json({ error: "Wallet session does not match requested state." }, { status: 403 }),
    };
  }

  return { walletAddress: normalizedWallet };
}

export async function GET(request: Request) {
  const walletAddress = new URL(request.url).searchParams.get("walletAddress");
  if (!walletAddress || !isAddress(walletAddress)) {
    return NextResponse.json({ error: "Valid walletAddress required." }, { status: 400 });
  }

  const normalizedWallet = normalizeWalletAddress(walletAddress);
  const session = await readWalletSession();

  if (!session) {
    return NextResponse.json(
      { state: createDefaultUserBetaState(normalizedWallet) },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  if (session.walletAddress !== normalizedWallet) {
    return NextResponse.json({ error: "Wallet session does not match requested state." }, { status: 403 });
  }

  const state = await getUserBetaState(normalizedWallet);
  return NextResponse.json({ state }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { state?: UserBetaState };
    if (!body.state?.walletAddress || !isAddress(body.state.walletAddress)) {
      return NextResponse.json({ error: "Valid state.walletAddress required." }, { status: 400 });
    }

    const auth = await requireWalletSession(body.state.walletAddress);
    if (auth.response) return auth.response;

    const current = await getUserBetaState(auth.walletAddress);
    const state = await saveUserBetaState(mergeUserBetaState(current, body.state));
    return NextResponse.json({ state }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      {
        error: "Unable to save beta state.",
      },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      walletAddress?: string;
      symbol?: string;
      signal?: AiSignal;
      sourceGeneratedAt?: string;
      alert?: UserAlert;
      holding?: PortfolioHolding;
      signals?: AiSignal[];
      history?: DashboardHistoryPoint[];
      positionUsd?: number;
      stopLossPct?: number;
      takeProfitPct?: number;
    };

    if (!body.walletAddress || !isAddress(body.walletAddress)) {
      return NextResponse.json({ error: "Valid walletAddress required." }, { status: 400 });
    }

    const auth = await requireWalletSession(body.walletAddress);
    if (auth.response) return auth.response;

    const current = await getUserBetaState(auth.walletAddress);
    let next = current;
    let meta: Record<string, unknown> = {};

    if (body.action === "toggle-watchlist") {
      if (!body.symbol) return NextResponse.json({ error: "symbol is required." }, { status: 400 });
      next = toggleWatchlistSymbol(current, body.symbol);
    } else if (body.action === "save-signal") {
      if (!body.signal || !body.sourceGeneratedAt) {
        return NextResponse.json({ error: "signal and sourceGeneratedAt are required." }, { status: 400 });
      }
      next = saveSignalToState(current, body.signal, body.sourceGeneratedAt);
    } else if (body.action === "upsert-alert") {
      if (!body.alert) return NextResponse.json({ error: "alert is required." }, { status: 400 });
      next = upsertAlert(current, body.alert);
    } else if (body.action === "upsert-holding") {
      if (!body.holding) return NextResponse.json({ error: "holding is required." }, { status: 400 });
      next = upsertHolding(current, body.holding);
    } else if (body.action === "run-backtest") {
      if (!body.signal) return NextResponse.json({ error: "signal is required." }, { status: 400 });
      const storedHistory = await getDashboardHistory(24, body.signal.asset);
      const history = storedHistory.length > 1 ? storedHistory : body.history ?? [];
      const result = runSignalBacktest({
        signal: body.signal,
        history,
        positionUsd: Number(body.positionUsd) || 250,
        stopLossPct: Number(body.stopLossPct) || 5,
        takeProfitPct: Number(body.takeProfitPct) || 10,
      });
      next = appendBacktest(current, result);
      meta = { backtest: result };
    } else if (body.action === "evaluate-alerts") {
      const signals = Array.isArray(body.signals) ? body.signals : [];
      const evaluated = evaluateAlerts(current, signals);
      next = evaluated.state;
      const delivered = await deliverTriggeredAlerts(evaluated.triggered, signals);
      meta = { triggered: evaluated.triggered, delivered };
    } else {
      return NextResponse.json({ error: "Unsupported user-state action." }, { status: 400 });
    }

    const state = await saveUserBetaState(next);
    return NextResponse.json({ state, ...meta }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      {
        error: "Unable to update beta state.",
      },
      { status: 400 }
    );
  }
}
