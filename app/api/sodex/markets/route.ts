import { NextResponse } from "next/server";
import { z } from "zod";

import { getLiveSodexMarket, getValueChainStatus } from "@/lib/sodex";

export const runtime = "nodejs";
export const revalidate = 15;

const symbolSchema = z.string().trim().regex(/^[A-Za-z0-9_]{3,40}$/).optional();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsedSymbol = symbolSchema.safeParse(searchParams.get("symbol") ?? undefined);
  if (!parsedSymbol.success) {
    return NextResponse.json({ error: "Invalid SoDEX symbol." }, { status: 400 });
  }

  const symbol = parsedSymbol.data;
  const [marketResult, chain] = await Promise.allSettled([getLiveSodexMarket(symbol), getValueChainStatus()]);
  const market = marketResult.status === "fulfilled" ? marketResult.value : undefined;
  const chainStatus = chain.status === "fulfilled" ? chain.value : undefined;
  const sourceNotes = [
    ...(market ? [] : ["SoDEX market data unavailable"]),
    ...(chainStatus?.isLive ? [] : ["ValueChain RPC did not confirm live status"]),
  ];

  return NextResponse.json(
    {
      state: market && chainStatus?.isLive ? "live" : "partial",
      sourceNotes,
      market,
      chain: chainStatus,
    },
    { status: market ? 200 : 503 }
  );
}
