import { isAddress, JsonRpcProvider, keccak256, toUtf8Bytes } from "ethers";
import { z } from "zod";

import { fallbackSodexMarket } from "@/lib/fallback-data";
import { VALUECHAIN_MAINNET, VALUECHAIN_TESTNET } from "@/lib/valuechain";
import type { ChainStatus, OrderIntent, OrderIntentInput, SodexMarket, WhaleEvent } from "@/lib/whalemind-types";

const SODEX_ENV = (process.env.SODEX_ENV === "testnet" ? "testnet" : "mainnet") as "mainnet" | "testnet";
const DEFAULT_SYMBOL = "vBTC_vUSDC";

const SPOT_ENDPOINT =
  process.env.SODEX_SPOT_ENDPOINT ??
  (SODEX_ENV === "testnet"
    ? "https://testnet-gw.sodex.dev/api/v1/spot"
    : "https://mainnet-gw.sodex.dev/api/v1/spot");

const CHAIN = SODEX_ENV === "testnet" ? VALUECHAIN_TESTNET : VALUECHAIN_MAINNET;

interface SodexResponse<T> {
  code: number;
  timestamp?: number;
  error?: string;
  data: T;
}

type LooseTicker = Record<string, unknown>;
type LooseBookTicker = Record<string, unknown>;
type LooseSymbol = Record<string, unknown>;
type LooseTrade = Record<string, unknown>;

const orderIntentSchema = z.object({
  walletAddress: z.string().refine((value) => isAddress(value), "Valid EVM wallet address required"),
  accountId: z.coerce.number().int().nonnegative().optional().default(0),
  symbol: z.string().min(3).optional().default(DEFAULT_SYMBOL),
  side: z.enum(["BUY", "SELL"]),
  notionalUsd: z.coerce.number().positive().max(1_000_000),
  orderType: z.enum(["MARKET", "LIMIT"]).optional().default("MARKET"),
  limitPrice: z.coerce.number().positive().optional(),
});

function toNumber(value: unknown, fallback?: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function pickNumber(record: Record<string, unknown>, keys: string[], fallback?: number) {
  for (const key of keys) {
    const value = toNumber(record[key], undefined);
    if (value !== undefined) return value;
  }
  return fallback;
}

function makeSodexUrl(path: string, query?: Record<string, string | number | undefined>) {
  const url = new URL(`${SPOT_ENDPOINT}${path}`);
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, String(value));
  });
  return url;
}

async function sodexGet<T>(path: string, query?: Record<string, string | number | undefined>) {
  const response = await fetch(makeSodexUrl(path, query), {
    headers: { Accept: "application/json" },
    next: { revalidate: 15 },
  });

  if (!response.ok) {
    throw new Error(`SoDEX request failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as SodexResponse<T>;
  if (body.code !== 0) {
    throw new Error(`SoDEX API error: ${body.error ?? body.code}`);
  }

  return body.data;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

export async function getValueChainStatus(): Promise<ChainStatus> {
  try {
    const provider = new JsonRpcProvider(CHAIN.rpcUrl, CHAIN.chainId);
    const [network, blockNumber] = await withTimeout(
      Promise.all([provider.getNetwork(), provider.getBlockNumber()]),
      5000,
      "ValueChain RPC"
    );

    return {
      chainId: Number(network.chainId),
      chainName: CHAIN.chainName,
      blockNumber,
      rpcUrl: CHAIN.rpcUrl,
      explorerUrl: CHAIN.explorerUrl,
      isLive: true,
    };
  } catch (error) {
    return {
      chainId: CHAIN.chainId,
      chainName: CHAIN.chainName,
      rpcUrl: CHAIN.rpcUrl,
      explorerUrl: CHAIN.explorerUrl,
      isLive: false,
      error: error instanceof Error ? error.message : "ValueChain RPC unavailable",
    };
  }
}

export async function getSodexMarket(symbol = DEFAULT_SYMBOL): Promise<SodexMarket> {
  try {
    const [tickers, books] = await Promise.all([
      sodexGet<LooseTicker[]>("/markets/tickers", { symbol }),
      sodexGet<LooseBookTicker[]>("/markets/bookTickers", { symbol }),
    ]);
    const ticker = tickers[0] ?? {};
    const book = books[0] ?? {};

    return {
      environment: SODEX_ENV,
      symbol,
      lastPrice: pickNumber(ticker, ["lastPrice", "price", "close", "c"], fallbackSodexMarket().lastPrice),
      priceChange24h: pickNumber(ticker, ["priceChangePercent", "priceChangePct", "changePct", "priceChange24h"]),
      volume24h: pickNumber(ticker, ["volume", "quoteVolume", "volume24h"]),
      bid: pickNumber(book, ["bidPrice", "bestBidPrice", "bid"]),
      ask: pickNumber(book, ["askPrice", "bestAskPrice", "ask"]),
      source: "SoDEX",
    };
  } catch {
    return { ...fallbackSodexMarket(), environment: SODEX_ENV, symbol };
  }
}

export async function getSodexWhaleEvents(symbol = DEFAULT_SYMBOL): Promise<WhaleEvent[]> {
  try {
    const trades = await sodexGet<LooseTrade[]>(`/markets/${symbol}/trades`, { limit: 25 });
    const generatedAt = new Date().toISOString();
    const events = trades
      .map((trade, index) => {
        const price = pickNumber(trade, ["price", "p"], 0) ?? 0;
        const quantity = pickNumber(trade, ["quantity", "qty", "q"], 0) ?? 0;
        const notionalUsd = price * quantity;
        const sideText = String(trade.side ?? trade.isBuyerMaker ?? "").toLowerCase();
        const direction: WhaleEvent["direction"] =
          sideText.includes("sell") || sideText === "true" ? "distribution" : "accumulation";

        return {
          id: `sodex-${symbol}-${index}`,
          asset: symbol.replace("v", "").split("_")[0] || "BTC",
          direction,
          notionalUsd,
          confidence: Math.min(92, Math.max(52, Math.round(notionalUsd / 25_000) + 55)),
          summary: `${symbol} order-book print detected on SoDEX with estimated notional exposure.`,
          source: "SoDEX order book" as const,
          timestamp: generatedAt,
        };
      })
      .filter((event) => event.notionalUsd > 0)
      .sort((a, b) => b.notionalUsd - a.notionalUsd)
      .slice(0, 3);

    return events.length > 0 ? events : [];
  } catch {
    return [];
  }
}

async function resolveSymbolId(symbol: string) {
  try {
    const symbols = await sodexGet<LooseSymbol[]>("/markets/symbols", { symbol });
    const match = symbols.find((item) => String(item.symbol ?? item.name ?? "") === symbol) ?? symbols[0];
    const id = pickNumber(match ?? {}, ["symbolID", "symbolId", "id"], 1);
    return id ?? 1;
  } catch {
    return 1;
  }
}

export async function createSodexOrderIntent(input: OrderIntentInput): Promise<OrderIntent> {
  const parsed = orderIntentSchema.parse(input);
  const symbolId = await resolveSymbolId(parsed.symbol);
  const clOrdID = `whalemind-${Date.now().toString(36)}`;
  const nonce = Date.now();
  const side = parsed.side === "BUY" ? 1 : 2;
  const type = parsed.orderType === "MARKET" ? 2 : 1;
  const timeInForce = parsed.orderType === "MARKET" ? 3 : 1;

  const order: Record<string, unknown> = {
    clOrdID,
    modifier: 1,
    side,
    type,
    timeInForce,
  };

  if (parsed.orderType === "LIMIT" && parsed.limitPrice) {
    order.price = String(parsed.limitPrice);
    order.quantity = String(Math.max(parsed.notionalUsd / parsed.limitPrice, 0.000001));
  } else if (parsed.side === "BUY") {
    order.funds = String(parsed.notionalUsd);
  } else {
    order.quantity = String(parsed.notionalUsd);
  }

  const payload = {
    type: "newOrder",
    params: {
      accountID: parsed.accountId,
      symbolID: symbolId,
      orders: [order],
    },
  };
  const payloadHash = keccak256(toUtf8Bytes(JSON.stringify(payload)));

  return {
    clOrdID,
    endpoint: `${SPOT_ENDPOINT}/trade/orders/batch`,
    method: "POST",
    nonce,
    payload,
    payloadHash,
    typedData: {
      domain: {
        name: "spot",
        version: "1",
        chainId: CHAIN.chainId,
        verifyingContract: "0x0000000000000000000000000000000000000000",
      },
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        ExchangeAction: [
          { name: "payloadHash", type: "bytes32" },
          { name: "nonce", type: "uint64" },
        ],
      },
      primaryType: "ExchangeAction",
      message: {
        payloadHash,
        nonce,
      },
    },
    headersPreview: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-API-Key": parsed.walletAddress,
      "X-API-Nonce": String(nonce),
    },
    executionMode: "ready-for-signature",
    warnings: [
      "This is an EIP-712 order intent. Submit only after the wallet signs and live execution is enabled.",
      "SoDEX requires the signature prefixed with 0x01 in X-API-Sign.",
    ],
  };
}

export async function executeSignedSodexOrder({
  intent,
  signature,
}: {
  intent: OrderIntent;
  signature: string;
}) {
  if (process.env.SODEX_ENABLE_LIVE_EXECUTION !== "true") {
    return {
      dryRun: true,
      message: "Live SoDEX execution is disabled. Set SODEX_ENABLE_LIVE_EXECUTION=true after wallet testing.",
      intent,
    };
  }

  const typedSignature = signature.startsWith("0x01") ? signature : `0x01${signature.replace(/^0x/, "")}`;
  const response = await fetch(intent.endpoint, {
    method: intent.method,
    headers: {
      ...intent.headersPreview,
      "X-API-Sign": typedSignature,
    },
    body: JSON.stringify(intent.payload.params),
  });

  const body = (await response.json()) as unknown;
  return {
    dryRun: false,
    status: response.status,
    body,
  };
}
