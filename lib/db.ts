import { MongoClient } from "mongodb";

import type { WhaleMindSnapshot } from "@/lib/whalemind-types";

let clientPromise: Promise<MongoClient> | undefined;

function getMongoClient() {
  if (!process.env.MONGODB_URI) return undefined;
  clientPromise ??= new MongoClient(process.env.MONGODB_URI).connect();
  return clientPromise;
}

export async function persistSnapshot(snapshot: WhaleMindSnapshot) {
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
}
