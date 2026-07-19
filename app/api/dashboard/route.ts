import { NextResponse } from "next/server";

import { getDashboardSnapshot } from "@/lib/dashboard-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DASHBOARD_CACHE_MS = 60_000;
let cachedSnapshot: { expiresAt: number; data: Awaited<ReturnType<typeof getDashboardSnapshot>> } | undefined;
let inFlightSnapshot: Promise<Awaited<ReturnType<typeof getDashboardSnapshot>>> | undefined;

export async function GET() {
  try {
    const now = Date.now();
    if (cachedSnapshot && cachedSnapshot.expiresAt > now) {
      return NextResponse.json(cachedSnapshot.data, {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      });
    }

    inFlightSnapshot ??= getDashboardSnapshot();
    const snapshot = await inFlightSnapshot;
    cachedSnapshot = {
      expiresAt: Date.now() + DASHBOARD_CACHE_MS,
      data: snapshot,
    };
    inFlightSnapshot = undefined;

    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch {
    inFlightSnapshot = undefined;
    return NextResponse.json(
      {
        error: "Unable to generate live WhaleMind dashboard.",
      },
      { status: 500 }
    );
  }
}
