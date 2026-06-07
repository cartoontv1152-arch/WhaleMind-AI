import { getAddress, isAddress, verifyMessage } from "ethers";
import { NextResponse } from "next/server";

import { consumeWalletChallenge, getUserBetaState, saveUserBetaState } from "@/lib/db";
import {
  createWalletSessionToken,
  WALLET_SESSION_COOKIE,
  WALLET_SESSION_MAX_AGE_SECONDS,
} from "@/lib/wallet-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      walletAddress?: string;
      message?: string;
      signature?: string;
    };

    if (!body.walletAddress || !isAddress(body.walletAddress) || !body.message || !body.signature) {
      return NextResponse.json({ error: "walletAddress, message, and signature are required." }, { status: 400 });
    }

    const recovered = verifyMessage(body.message, body.signature);
    if (getAddress(recovered) !== getAddress(body.walletAddress)) {
      return NextResponse.json({ error: "Wallet signature did not match the challenge address." }, { status: 401 });
    }

    const challengeOk = await consumeWalletChallenge(body.walletAddress, body.message);
    if (!challengeOk) {
      return NextResponse.json({ error: "Wallet challenge expired or already used." }, { status: 401 });
    }

    const current = await getUserBetaState(body.walletAddress);
    const state = await saveUserBetaState({
      ...current,
      authenticated: true,
      updatedAt: new Date().toISOString(),
    });

    const response = NextResponse.json({ authenticated: true, state }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(WALLET_SESSION_COOKIE, createWalletSessionToken(body.walletAddress), {
      httpOnly: true,
      maxAge: WALLET_SESSION_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch {
    return NextResponse.json(
      {
        error: "Unable to verify wallet session.",
      },
      { status: 400 }
    );
  }
}
