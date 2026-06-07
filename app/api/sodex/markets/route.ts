import { NextResponse } from "next/server";
import { z } from "zod";

import { getSodexMarket, getValueChainStatus } from "@/lib/sodex";

export const runtime = "nodejs";
export const revalidate = 15;

const symbolSchema = z.string().trim().regex(/^[A-Za-z0-9_:-]{3,40}$/).optional();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsedSymbol = symbolSchema.safeParse(searchParams.get("symbol") ?? undefined);
  if (!parsedSymbol.success) {
    return NextResponse.json({ error: "Invalid SoDEX symbol." }, { status: 400 });
  }

  const symbol = parsedSymbol.data;
  const [market, chain] = await Promise.all([getSodexMarket(symbol), getValueChainStatus()]);

  return NextResponse.json({ market, chain });
}
