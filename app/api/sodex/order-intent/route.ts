import { NextResponse } from "next/server";

import { createSodexOrderIntent } from "@/lib/sodex";
import { normalizeWalletAddress } from "@/lib/user-state";
import { readWalletSession } from "@/lib/wallet-session";
import type { OrderIntentInput } from "@/lib/whalemind-types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as OrderIntentInput;
    const session = await readWalletSession();
    if (!session) {
      return NextResponse.json({ error: "Wallet session required. Sign the wallet challenge first." }, { status: 401 });
    }
    if (!body.walletAddress || session.walletAddress !== normalizeWalletAddress(body.walletAddress)) {
      return NextResponse.json({ error: "Wallet session does not match requested SoDEX intent." }, { status: 403 });
    }

    const intent = await createSodexOrderIntent(body);
    return NextResponse.json(intent);
  } catch {
    return NextResponse.json(
      {
        error: "Unable to create SoDEX order intent.",
      },
      { status: 400 }
    );
  }
}
