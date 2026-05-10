import { NextResponse } from "next/server";

import { getSodexMarket, getValueChainStatus } from "@/lib/sodex";

export const runtime = "nodejs";
export const revalidate = 15;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") ?? undefined;
  const [market, chain] = await Promise.all([getSodexMarket(symbol), getValueChainStatus()]);

  return NextResponse.json({ market, chain });
}
