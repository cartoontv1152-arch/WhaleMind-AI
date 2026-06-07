import { isAddress } from "ethers";
import { NextResponse } from "next/server";

import { createWalletChallenge } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { walletAddress?: string };
    if (!body.walletAddress || !isAddress(body.walletAddress)) {
      return NextResponse.json({ error: "Valid walletAddress required." }, { status: 400 });
    }

    const challenge = await createWalletChallenge(body.walletAddress);
    return NextResponse.json(challenge, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      {
        error: "Unable to create wallet challenge.",
      },
      { status: 500 }
    );
  }
}
