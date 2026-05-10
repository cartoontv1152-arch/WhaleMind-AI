import { NextResponse } from "next/server";

import { createSodexOrderIntent } from "@/lib/sodex";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const intent = await createSodexOrderIntent(body);
    return NextResponse.json(intent);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to create SoDEX order intent.",
        detail: error instanceof Error ? error.message : "Invalid request",
      },
      { status: 400 }
    );
  }
}
