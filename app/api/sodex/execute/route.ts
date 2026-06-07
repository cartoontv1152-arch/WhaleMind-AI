import { NextResponse } from "next/server";

import { executeSignedSodexOrder } from "@/lib/sodex";
import { normalizeWalletAddress } from "@/lib/user-state";
import { readWalletSession } from "@/lib/wallet-session";
import type { OrderIntent } from "@/lib/whalemind-types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      intent?: OrderIntent;
      signature?: string;
      signerAddress?: string;
      confirmed?: boolean;
    };
    const walletAddress = body.intent?.walletAddress ?? body.signerAddress;
    const session = await readWalletSession();
    if (!session) {
      return NextResponse.json({ error: "Wallet session required. Sign the beta challenge first." }, { status: 401 });
    }
    if (!walletAddress || session.walletAddress !== normalizeWalletAddress(walletAddress)) {
      return NextResponse.json({ error: "Wallet session does not match signed SoDEX submission." }, { status: 403 });
    }

    if (!body.intent || !body.signature || !body.signerAddress) {
      return NextResponse.json({ error: "intent, signature, and signerAddress are required." }, { status: 400 });
    }

    const result = await executeSignedSodexOrder({
      intent: body.intent,
      signature: body.signature,
      signerAddress: body.signerAddress,
      confirmed: body.confirmed,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      {
        error: "Unable to submit signed SoDEX order.",
      },
      { status: 400 }
    );
  }
}
