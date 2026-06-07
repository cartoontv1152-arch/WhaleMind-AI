import { NextResponse } from "next/server";

import { getWhaleMindSnapshot } from "@/lib/signal-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const INTELLIGENCE_CACHE_MS = 30_000;
let cachedSnapshot: { expiresAt: number; data: Awaited<ReturnType<typeof getWhaleMindSnapshot>> } | undefined;
let inFlightSnapshot: Promise<Awaited<ReturnType<typeof getWhaleMindSnapshot>>> | undefined;

export async function GET() {
  try {
    const now = Date.now();
    if (cachedSnapshot && cachedSnapshot.expiresAt > now) {
      return NextResponse.json(cachedSnapshot.data, {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      });
    }

    inFlightSnapshot ??= getWhaleMindSnapshot();
    const snapshot = await inFlightSnapshot;
    cachedSnapshot = {
      expiresAt: Date.now() + INTELLIGENCE_CACHE_MS,
      data: snapshot,
    };
    inFlightSnapshot = undefined;

    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch {
    inFlightSnapshot = undefined;
    return NextResponse.json(
      {
        error: "Unable to generate WhaleMind intelligence snapshot.",
      },
      { status: 500 }
    );
  }
}
