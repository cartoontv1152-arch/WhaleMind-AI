import { NextResponse } from "next/server";

import { getDashboardSnapshot } from "@/lib/dashboard-data";

export const runtime = "nodejs";
export const revalidate = 15;

export async function GET() {
  try {
    const snapshot = await getDashboardSnapshot();
    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "s-maxage=15, stale-while-revalidate=30",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to generate live WhaleMind dashboard.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
