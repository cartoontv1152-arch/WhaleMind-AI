import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

import { normalizeWalletAddress } from "@/lib/user-state";

export const WALLET_SESSION_COOKIE = "whalemind_session";
export const WALLET_SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

interface WalletSessionPayload {
  walletAddress: string;
  exp: number;
  v: 1;
}

let developmentSecret: string | undefined;

export function hasConfiguredWalletSessionSecret() {
  return Boolean(process.env.WHALEMIND_SESSION_SECRET && process.env.WHALEMIND_SESSION_SECRET.length >= 32);
}

function getWalletSessionSecret() {
  if (hasConfiguredWalletSessionSecret()) {
    return process.env.WHALEMIND_SESSION_SECRET as string;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("WHALEMIND_SESSION_SECRET must be set to enable wallet-owned saved state in production.");
  }

  developmentSecret ??= randomBytes(32).toString("hex");
  return developmentSecret;
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getWalletSessionSecret()).update(encodedPayload).digest("base64url");
}

function signaturesMatch(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function createWalletSessionToken(walletAddress: string) {
  const payload: WalletSessionPayload = {
    walletAddress: normalizeWalletAddress(walletAddress),
    exp: Math.floor(Date.now() / 1000) + WALLET_SESSION_MAX_AGE_SECONDS,
    v: 1,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifyWalletSessionToken(token?: string | null) {
  if (!token) return undefined;

  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra) return undefined;

  try {
    const expectedSignature = signPayload(encodedPayload);
    if (!signaturesMatch(signature, expectedSignature)) return undefined;

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<WalletSessionPayload>;
    if (payload.v !== 1 || !payload.walletAddress || !payload.exp) return undefined;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return undefined;

    return {
      walletAddress: normalizeWalletAddress(payload.walletAddress),
      exp: payload.exp,
    };
  } catch {
    return undefined;
  }
}

export async function readWalletSession() {
  const cookieStore = await cookies();
  return verifyWalletSessionToken(cookieStore.get(WALLET_SESSION_COOKIE)?.value);
}
