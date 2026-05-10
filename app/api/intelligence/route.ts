import { NextResponse } from "next/server";

import { getWhaleMindSnapshot } from "@/lib/signal-engine";

export const runtime = "nodejs";
export const revalidate = 30;

export async function GET() {
  try {
    const snapshot = await getWhaleMindSnapshot();
    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to generate WhaleMind intelligence snapshot.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
