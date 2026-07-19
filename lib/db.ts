import { randomUUID } from "crypto";
import { MongoClient } from "mongodb";

import {
  createDefaultUserBetaState,
  normalizeWalletAddress,
  sanitizeUserBetaState,
} from "@/lib/user-state";
import type { DashboardHistoryPoint, UserBetaState, WalletChallenge, WhaleMindSnapshot } from "@/lib/whalemind-types";

let clientPromise: Promise<MongoClient> | undefined;
const memoryChallenges = new Map<string, WalletChallenge>();
const memoryUserStates = new Map<string, UserBetaState>();

async function getDatabase() {
  if (!process.env.MONGODB_URI) return undefined;

  try {
    clientPromise ??= new MongoClient(process.env.MONGODB_URI).connect();
    const client = await clientPromise;
    return client.db(process.env.MONGODB_DB ?? "whalemind");
  } catch {
    clientPromise = undefined;
    return undefined;
  }
}

export async function getPersistenceStatus() {
  if (!process.env.MONGODB_URI) {
    return {
      configured: false,
      available: false,
      reason: "MONGODB_URI not configured",
    };
  }

  const db = await getDatabase();
  if (!db) {
    return {
      configured: true,
      available: false,
      reason: "MongoDB unavailable",
    };
  }

  try {
    await db.command({ ping: 1 });
    return {
      configured: true,
      available: true,
      database: db.databaseName,
    };
  } catch {
    return {
      configured: true,
      available: false,
      reason: "MongoDB ping failed",
    };
  }
}

export async function persistSnapshot(snapshot: WhaleMindSnapshot) {
  try {
    const db = await getDatabase();
    if (!db) {
      return {
        stored: false,
        reason: process.env.MONGODB_URI ? "MongoDB unavailable" : "MONGODB_URI not configured",
      };
    }

    await db.collection("signal_snapshots").insertOne({
      ...snapshot,
      createdAt: new Date(snapshot.generatedAt),
    });

    return { stored: true };
  } catch {
    return {
      stored: false,
      reason: "MongoDB persistence failed",
    };
  }
}

export async function getDashboardHistory(limit = 24, assetSymbol?: string): Promise<DashboardHistoryPoint[]> {
  try {
    const db = await getDatabase();
    if (!db) return [];

    const query = assetSymbol ? { "assets.symbol": assetSymbol.toUpperCase() } : {};
    const rows = await db
      .collection("signal_snapshots")
      .find(
        query,
        {
          projection: {
            _id: 0,
            generatedAt: 1,
            "assets.symbol": 1,
            "assets.price": 1,
            "assets.change24h": 1,
            "assets.volume24h": 1,
            "assets.marketCap": 1,
            "signals.asset": 1,
            "signals.action": 1,
            "signals.confidence": 1,
            "indices.ticker": 1,
            "indices.name": 1,
            "indices.price": 1,
            "indices.change24h": 1,
            "indices.roi7d": 1,
            "indices.roi1m": 1,
            "indices.roi3m": 1,
            "indices.ytd": 1,
            "sodex.symbol": 1,
            "sodex.lastPrice": 1,
            "sodex.priceChange24h": 1,
            "sodex.volume24h": 1,
            "sodex.bid": 1,
            "sodex.ask": 1,
            "chain.blockNumber": 1,
          },
        }
      )
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return rows
      .map((row) => ({
        generatedAt: String(row.generatedAt),
        assets: Array.isArray(row.assets) ? row.assets : [],
        signals: Array.isArray(row.signals) ? row.signals : [],
        indices: Array.isArray(row.indices) ? row.indices : [],
        sodex: row.sodex,
        chain: row.chain,
      }))
      .reverse() as DashboardHistoryPoint[];
  } catch {
    return [];
  }
}

export async function createWalletChallenge(walletAddress: string): Promise<WalletChallenge> {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  const nonce = randomUUID();
  const now = Date.now();
  const challenge: WalletChallenge = {
    walletAddress: normalizedWallet,
    nonce,
    expiresAt: new Date(now + 5 * 60_000).toISOString(),
    message: [
      "WhaleMind AI wallet login",
      "",
      "Sign this message to open your private workspace.",
      "This does not submit a transaction or authorize a trade.",
      "",
      `Wallet: ${normalizedWallet}`,
      `Nonce: ${nonce}`,
      `Issued At: ${new Date(now).toISOString()}`,
    ].join("\n"),
  };

  const db = await getDatabase();
  if (!db) {
    memoryChallenges.set(nonce, challenge);
    return challenge;
  }

  await db.collection("wallet_challenges").updateOne(
    { nonce },
    {
      $set: {
        ...challenge,
        used: false,
        createdAt: new Date(now),
        expiresAtDate: new Date(challenge.expiresAt),
      },
    },
    { upsert: true }
  );

  return challenge;
}

export async function consumeWalletChallenge(walletAddress: string, message: string) {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  const nonce = message.match(/^Nonce:\s*([0-9a-f-]+)$/m)?.[1];
  if (!nonce) return false;

  const memoryChallenge = memoryChallenges.get(nonce);
  if (memoryChallenge) {
    const valid =
      memoryChallenge.walletAddress === normalizedWallet &&
      memoryChallenge.message === message &&
      Date.parse(memoryChallenge.expiresAt) >= Date.now();
    if (valid) memoryChallenges.delete(nonce);
    return valid;
  }

  const db = await getDatabase();
  if (!db) return false;

  const result = await db.collection("wallet_challenges").findOneAndUpdate(
    {
      nonce,
      walletAddress: normalizedWallet,
      message,
      used: false,
      expiresAtDate: { $gt: new Date() },
    },
    {
      $set: {
        used: true,
        usedAt: new Date(),
      },
    },
    {
      returnDocument: "after",
    }
  );

  return Boolean(result);
}

export async function getUserBetaState(walletAddress: string): Promise<UserBetaState> {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  const db = await getDatabase();

  if (!db) {
    return memoryUserStates.get(normalizedWallet) ?? createDefaultUserBetaState(normalizedWallet);
  }

  const row = await db.collection("user_beta_states").findOne<UserBetaState>(
    { walletAddress: normalizedWallet },
    { projection: { _id: 0 } }
  );

  return row ? sanitizeUserBetaState(row) : createDefaultUserBetaState(normalizedWallet);
}

export async function saveUserBetaState(state: UserBetaState): Promise<UserBetaState> {
  const sanitized = sanitizeUserBetaState({
    ...state,
    updatedAt: new Date().toISOString(),
  });
  const db = await getDatabase();

  if (!db) {
    memoryUserStates.set(sanitized.walletAddress, sanitized);
    return sanitized;
  }

  await db.collection("user_beta_states").updateOne(
    { walletAddress: sanitized.walletAddress },
    {
      $set: {
        ...sanitized,
        updatedAtDate: new Date(sanitized.updatedAt),
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );

  return sanitized;
}
