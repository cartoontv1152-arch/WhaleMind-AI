import { MongoClient } from "mongodb";

import type { DashboardHistoryPoint, WhaleMindSnapshot } from "@/lib/whalemind-types";

let clientPromise: Promise<MongoClient> | undefined;

function getMongoClient() {
  if (!process.env.MONGODB_URI) return undefined;
  clientPromise ??= new MongoClient(process.env.MONGODB_URI).connect();
  return clientPromise;
}

export async function persistSnapshot(snapshot: WhaleMindSnapshot) {
  try {
    const client = await getMongoClient();
    if (!client) {
      return { stored: false, reason: "MONGODB_URI not configured" };
    }

    const db = client.db(process.env.MONGODB_DB ?? "whalemind");
    await db.collection("signal_snapshots").insertOne({
      ...snapshot,
      createdAt: new Date(snapshot.generatedAt),
    });

    return { stored: true };
  } catch (error) {
    return {
      stored: false,
      reason: error instanceof Error ? error.message : "MongoDB persistence failed",
    };
  }
}

export async function getDashboardHistory(limit = 24): Promise<DashboardHistoryPoint[]> {
  try {
    const client = await getMongoClient();
    if (!client) return [];

    const db = client.db(process.env.MONGODB_DB ?? "whalemind");
    const rows = await db
      .collection("signal_snapshots")
      .find(
        {},
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
        sodex: row.sodex,
        chain: row.chain,
      }))
      .reverse() as DashboardHistoryPoint[];
  } catch {
    return [];
  }
}
