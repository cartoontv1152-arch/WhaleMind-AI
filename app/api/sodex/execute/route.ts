import { NextResponse } from "next/server";

import { executeSignedSodexOrder } from "@/lib/sodex";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await executeSignedSodexOrder(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to submit signed SoDEX order.",
        detail: error instanceof Error ? error.message : "Invalid request",
      },
      { status: 400 }
    );
  }
}
