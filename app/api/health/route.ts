import { NextResponse } from "next/server";

import { getPersistenceStatus } from "@/lib/db";
import { getSodexRuntimeConfig } from "@/lib/sodex";
import { getSosoRateLimitStatus, getSosoRefreshSeconds } from "@/lib/sosovalue";
import { hasConfiguredWalletSessionSecret } from "@/lib/wallet-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const persistence = await getPersistenceStatus();
  const sodex = getSodexRuntimeConfig();
  const mongodbRequired = process.env.MONGODB_REQUIRED !== "false";
  const liveSodexRequested = process.env.SODEX_ENABLE_LIVE_EXECUTION === "true";

  const checks = [
    {
      name: "SoSoValue API key",
      ok: Boolean(process.env.SOSOVALUE_API_KEY),
      required: true,
    },
    {
      name: "MongoDB durable state",
      ok: persistence.available,
      required: mongodbRequired,
      detail: persistence.available ? persistence.database : persistence.reason,
    },
    {
      name: "Wallet session secret",
      ok: hasConfiguredWalletSessionSecret(),
      required: true,
    },
    {
      name: "SoDEX account ID",
      ok: sodex.hasDefaultAccountId,
      required: liveSodexRequested,
    },
    {
      name: "SoDEX verifying contract",
      ok: sodex.hasVerifyingContract,
      required: liveSodexRequested,
    },
    {
      name: "SoDEX browser-wallet signing mode",
      ok: !sodex.hasApiKeyName,
      required: liveSodexRequested,
      detail: sodex.hasApiKeyName ? "API-key mode is preview-only in the browser wallet flow" : "master-wallet mode",
    },
  ];

  const ready = checks.every((check) => !check.required || check.ok);

  return NextResponse.json(
    {
      state: ready ? "ready" : "blocked",
      generatedAt: new Date().toISOString(),
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      region: process.env.VERCEL_REGION,
      checks,
      providers: {
        sosovalue: {
          refreshSeconds: getSosoRefreshSeconds(),
          rateLimit: getSosoRateLimitStatus(),
        },
        sodex: {
          environment: sodex.environment,
          defaultSymbol: sodex.defaultSymbol,
          symbolMap: sodex.symbolMap,
          liveExecutionEnabled: sodex.liveExecutionEnabled,
        },
      },
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
