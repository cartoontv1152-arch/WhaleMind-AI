import { NextResponse } from "next/server";

import { getDashboardSnapshot } from "@/lib/dashboard-data";
import { readWalletSession } from "@/lib/wallet-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const session = await readWalletSession();
    const snapshot = await getDashboardSnapshot({ persist: Boolean(session) });
    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "Unable to generate live WhaleMind dashboard.",
      },
      { status: 500 }
    );
  }
}
