import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { getAddress, isAddress, JsonRpcProvider, keccak256, toUtf8Bytes, verifyTypedData } from "ethers";
import { z } from "zod";

import { VALUECHAIN_MAINNET, VALUECHAIN_TESTNET } from "@/lib/valuechain";
import type { ChainStatus, OrderIntent, OrderIntentInput, SodexMarket, WhaleEvent } from "@/lib/whalemind-types";

const SODEX_ENV = (process.env.SODEX_ENV === "testnet" ? "testnet" : "mainnet") as "mainnet" | "testnet";
const DEFAULT_SYMBOL = normalizeSodexSymbol(process.env.SODEX_DEFAULT_SYMBOL ?? "vBTC_vUSDC");
const SODEX_DEFAULT_ACCOUNT_ID =
  process.env.SODEX_DEFAULT_ACCOUNT_ID !== undefined && process.env.SODEX_DEFAULT_ACCOUNT_ID !== ""
    ? Number(process.env.SODEX_DEFAULT_ACCOUNT_ID)
    : undefined;
const DEFAULT_EIP712_VERIFYING_CONTRACT = "0x0000000000000000000000000000000000000000";
const SODEX_EIP712_VERIFYING_CONTRACT = process.env.SODEX_EIP712_VERIFYING_CONTRACT;
const SODEX_API_KEY_NAME = process.env.SODEX_API_KEY_NAME;
const SODEX_REQUEST_TIMEOUT_MS = 8000;

const SPOT_ENDPOINT =
  process.env.SODEX_SPOT_ENDPOINT ??
  (SODEX_ENV === "testnet"
    ? "https://testnet-gw.sodex.dev/api/v1/spot"
    : "https://mainnet-gw.sodex.dev/api/v1/spot");

const CHAIN = SODEX_ENV === "testnet" ? VALUECHAIN_TESTNET : VALUECHAIN_MAINNET;
const ORDER_ENDPOINT = `${SPOT_ENDPOINT}/trade/orders/batch`;

let developmentIntentSecret: string | undefined;

const DEFAULT_SYMBOL_MAP: Record<string, string> = {
  BTC: "vBTC_vUSDC",
  ETH: "vETH_vUSDC",
  SOL: "vSOL_vUSDC",
  XRP: "vXRP_vUSDC",
};

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

function normalizeAssetSymbol(symbol: string) {
  return symbol.trim().replace(/^v/i, "").split("_")[0].toUpperCase();
}

function normalizeSodexSymbol(symbol: string) {
  const trimmed = symbol.trim();
  const [base, quote = "vUSDC"] = trimmed.split("_");
  const normalizedBase = base.toLowerCase().startsWith("v") ? `v${base.slice(1).toUpperCase()}` : `v${base.toUpperCase()}`;
  const normalizedQuote = quote.toLowerCase().startsWith("v") ? `v${quote.slice(1).toUpperCase()}` : `v${quote.toUpperCase()}`;
  return `${normalizedBase}_${normalizedQuote}`;
}

function parseSodexSymbolMap(value?: string) {
  const configured = new Map<string, string>();
  Object.entries(DEFAULT_SYMBOL_MAP).forEach(([asset, symbol]) => configured.set(asset, symbol));

  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const [asset, symbol] = item.split(":").map((part) => part?.trim());
      if (asset && symbol) configured.set(normalizeAssetSymbol(asset), normalizeSodexSymbol(symbol));
    });

  return configured;
}

const SODEX_SYMBOL_MAP = parseSodexSymbolMap(process.env.SODEX_SYMBOL_MAP);

export function getSodexSymbolForAsset(asset: string) {
  const normalizedAsset = normalizeAssetSymbol(asset);
  return SODEX_SYMBOL_MAP.get(normalizedAsset) ?? normalizeSodexSymbol(`v${normalizedAsset}_vUSDC`);
}

export function getSodexRoutesForAssets(assetSymbols: string[]) {
  return Object.fromEntries(
    Array.from(new Set(assetSymbols.map(normalizeAssetSymbol).filter(Boolean))).map((asset) => [
      asset,
      getSodexSymbolForAsset(asset),
    ])
  );
}

function assetFromSodexSymbol(symbol: string) {
  return normalizeAssetSymbol(symbol);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const orderIntentSchema = z.object({
  walletAddress: z.string().refine((value) => isAddress(value), "Valid EVM wallet address required"),
  accountId: z.coerce.number().int().nonnegative().optional(),
  apiKeyName: z
    .string()
    .trim()
    .regex(/^[0-9a-zA-Z_-]{1,36}$/)
    .optional(),
  symbol: z.string().min(3).transform(normalizeSodexSymbol).optional().default(DEFAULT_SYMBOL),
  side: z.enum(["BUY", "SELL"]),
  notionalUsd: z.coerce.number().positive().max(1_000_000),
  orderType: z.enum(["MARKET", "LIMIT"]).optional().default("MARKET"),
  limitPrice: z.coerce.number().positive().optional(),
});

export function getSodexRuntimeConfig() {
  const hasEnvAccount = SODEX_DEFAULT_ACCOUNT_ID !== undefined && Number.isFinite(SODEX_DEFAULT_ACCOUNT_ID);
  const hasContract = Boolean(SODEX_EIP712_VERIFYING_CONTRACT && isAddress(SODEX_EIP712_VERIFYING_CONTRACT));
  const liveExecutionEnabled =
    process.env.SODEX_ENABLE_LIVE_EXECUTION === "true" && hasEnvAccount && hasContract && !SODEX_API_KEY_NAME;

  return {
    environment: SODEX_ENV,
    defaultSymbol: DEFAULT_SYMBOL,
    symbolMap: getSodexRoutesForAssets(Array.from(SODEX_SYMBOL_MAP.keys())),
    spotEndpoint: SPOT_ENDPOINT,
    hasDefaultAccountId: hasEnvAccount,
    hasApiKeyName: Boolean(SODEX_API_KEY_NAME),
    hasVerifyingContract: hasContract,
    liveExecutionEnabled,
  };
}

function getIntentProofSecret() {
  if (process.env.WHALEMIND_SESSION_SECRET && process.env.WHALEMIND_SESSION_SECRET.length >= 32) {
    return process.env.WHALEMIND_SESSION_SECRET;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("WHALEMIND_SESSION_SECRET must be set before SoDEX intents can be issued.");
  }

  developmentIntentSecret ??= randomBytes(32).toString("hex");
  return developmentIntentSecret;
}

function stableIntentProofPayload(intent: Omit<OrderIntent, "serverProof">) {
  return JSON.stringify({
    clOrdID: intent.clOrdID,
    endpoint: intent.endpoint,
    method: intent.method,
    walletAddress: getAddress(intent.walletAddress),
    signingMode: intent.signingMode,
    apiKeyName: intent.apiKeyName,
    nonce: intent.nonce,
    payloadHash: intent.payloadHash,
    typedData: intent.typedData,
    headersPreview: intent.headersPreview,
    executionMode: intent.executionMode,
  });
}

function signOrderIntent(intent: Omit<OrderIntent, "serverProof">) {
  return createHmac("sha256", getIntentProofSecret()).update(stableIntentProofPayload(intent)).digest("base64url");
}

function proofMatches(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function verifyOrderIntentProof(intent: OrderIntent) {
  const { serverProof, ...unsignedIntent } = intent;
  return proofMatches(serverProof, signOrderIntent(unsignedIntent));
}

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
    signal: AbortSignal.timeout(SODEX_REQUEST_TIMEOUT_MS),
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

async function readSodexMarket(symbol = DEFAULT_SYMBOL): Promise<SodexMarket> {
  const resolvedSymbol = normalizeSodexSymbol(symbol);
  const [tickers, books] = await Promise.all([
    sodexGet<LooseTicker[]>("/markets/tickers", { symbol: resolvedSymbol }),
    sodexGet<LooseBookTicker[]>("/markets/bookTickers", { symbol: resolvedSymbol }),
  ]);
  const ticker = tickers[0] ?? {};
  const book = books[0] ?? {};

  return {
    environment: SODEX_ENV,
    symbol: resolvedSymbol,
    lastPrice: pickNumber(ticker, ["lastPrice", "price", "close", "c"]),
    priceChange24h: pickNumber(ticker, ["priceChangePercent", "priceChangePct", "changePct", "priceChange24h"]),
    volume24h: pickNumber(ticker, ["volume", "quoteVolume", "volume24h"]),
    bid: pickNumber(book, ["bidPrice", "bestBidPrice", "bid"]),
    ask: pickNumber(book, ["askPrice", "bestAskPrice", "ask"]),
    source: "SoDEX",
  };
}

export async function getLiveSodexMarket(symbol = DEFAULT_SYMBOL): Promise<SodexMarket> {
  return readSodexMarket(symbol);
}

export async function getSodexMarket(symbol = DEFAULT_SYMBOL): Promise<SodexMarket> {
  return readSodexMarket(symbol);
}

export async function getLiveSodexMarketsForAssets(assetSymbols: string[]): Promise<Record<string, SodexMarket>> {
  const routes = getSodexRoutesForAssets(assetSymbols);
  const entries = await Promise.allSettled(
    Object.entries(routes).map(async ([asset, symbol]) => [asset, await readSodexMarket(symbol)] as const)
  );

  return Object.fromEntries(
    entries
      .filter((entry): entry is PromiseFulfilledResult<readonly [string, SodexMarket]> => entry.status === "fulfilled")
      .map((entry) => entry.value)
  );
}

async function readSodexWhaleEvents(symbol = DEFAULT_SYMBOL): Promise<WhaleEvent[]> {
  const resolvedSymbol = normalizeSodexSymbol(symbol);
  const trades = await sodexGet<LooseTrade[]>(`/markets/${resolvedSymbol}/trades`, { limit: 25 });
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
        id: `sodex-${resolvedSymbol}-${index}`,
        asset: assetFromSodexSymbol(resolvedSymbol),
        direction,
        notionalUsd,
        confidence: Math.min(92, Math.max(52, Math.round(notionalUsd / 25_000) + 55)),
        summary: `${resolvedSymbol} order-book print detected on SoDEX with estimated notional exposure.`,
        source: "SoDEX order book" as const,
        timestamp: generatedAt,
      };
    })
    .filter((event) => event.notionalUsd > 0)
    .sort((a, b) => b.notionalUsd - a.notionalUsd)
    .slice(0, 3);

  return events.length > 0 ? events : [];
}

export async function getLiveSodexWhaleEvents(symbol = DEFAULT_SYMBOL): Promise<WhaleEvent[]> {
  return readSodexWhaleEvents(symbol);
}

export async function getSodexWhaleEvents(symbol = DEFAULT_SYMBOL): Promise<WhaleEvent[]> {
  try {
    return await readSodexWhaleEvents(symbol);
  } catch {
    return [];
  }
}

export async function getLiveSodexWhaleEventsForAssets(assetSymbols: string[]): Promise<WhaleEvent[]> {
  const routes = getSodexRoutesForAssets(assetSymbols);
  const results = await Promise.allSettled(Object.values(routes).map((symbol) => readSodexWhaleEvents(symbol)));
  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

async function resolveSymbolId(symbol: string) {
  const resolvedSymbol = normalizeSodexSymbol(symbol);
  const symbols = await sodexGet<LooseSymbol[]>("/markets/symbols", { symbol: resolvedSymbol });
  const match = symbols.find((item) => String(item.symbol ?? item.name ?? "") === resolvedSymbol);
  const id = match ? pickNumber(match, ["symbolID", "symbolId", "id"]) : undefined;
  if (id === undefined) throw new Error(`SoDEX symbol ${resolvedSymbol} could not be resolved.`);
  return id;
}

export async function createSodexOrderIntent(input: OrderIntentInput): Promise<OrderIntent> {
  const parsed = orderIntentSchema.parse(input);
  const [symbolIdResult, marketResult] = await Promise.allSettled([
    resolveSymbolId(parsed.symbol),
    readSodexMarket(parsed.symbol).catch(() => undefined),
  ]);
  const symbolId = symbolIdResult.status === "fulfilled" ? symbolIdResult.value : undefined;
  const market = marketResult.status === "fulfilled" ? marketResult.value : undefined;
  const resolvedAccountId = parsed.accountId ?? SODEX_DEFAULT_ACCOUNT_ID;
  const apiKeyName = parsed.apiKeyName ?? SODEX_API_KEY_NAME;
  const hasAccountId = resolvedAccountId !== undefined && Number.isFinite(resolvedAccountId);
  const hasVerifyingContract = Boolean(
    SODEX_EIP712_VERIFYING_CONTRACT && isAddress(SODEX_EIP712_VERIFYING_CONTRACT)
  );
  const verifyingContract =
    hasVerifyingContract && SODEX_EIP712_VERIFYING_CONTRACT
      ? SODEX_EIP712_VERIFYING_CONTRACT
      : DEFAULT_EIP712_VERIFYING_CONTRACT;
  const nonce = Date.now() * 1000 + randomInt(0, 1000);
  const clOrdID = `whalemind-${nonce.toString(36)}-${randomBytes(3).toString("hex")}`;
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
    const referencePrice = market?.lastPrice ?? parsed.limitPrice;
    order.quantity = String(referencePrice ? Math.max(parsed.notionalUsd / referencePrice, 0.000001) : parsed.notionalUsd);
  }

  const payload = {
    accountID: hasAccountId ? resolvedAccountId : 0,
    symbolID: symbolId ?? 0,
    orders: [order],
  };
  const payloadHash = keccak256(toUtf8Bytes(JSON.stringify(payload)));
  const canBrowserSignForLiveExecution = hasAccountId && symbolId !== undefined && hasVerifyingContract && !apiKeyName;

  const intentWithoutProof: Omit<OrderIntent, "serverProof"> = {
    clOrdID,
    endpoint: ORDER_ENDPOINT,
    method: "POST",
    walletAddress: getAddress(parsed.walletAddress),
    signingMode: apiKeyName ? "registered-api-key" : "master-wallet",
    apiKeyName,
    nonce,
    payload,
    payloadHash,
    typedData: {
      domain: {
        name: "spot",
        version: "1",
        chainId: CHAIN.chainId,
        verifyingContract,
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
      ...(apiKeyName ? { "X-API-Key": apiKeyName } : {}),
      "X-API-Nonce": String(nonce),
    },
    executionMode: canBrowserSignForLiveExecution ? "ready-for-signature" : "dry-run",
    warnings: [
      "This is an EIP-712 order intent. Submit only after the wallet signs and live execution is enabled.",
      "The EIP-712 payload hash signs the exact JSON body WhaleMind will submit to SoDEX.",
      apiKeyName
        ? "Registered API-key mode is preview-only in WhaleMind: SoDEX requires the API key private key to sign trading actions, not the browser wallet."
        : "No X-API-Key header is included; SoDEX will verify this as a master-wallet signed request.",
      "SoDEX requires the signature prefixed with 0x01 in X-API-Sign.",
      ...(apiKeyName
        ? ["Remove SODEX_API_KEY_NAME for browser-wallet master signing, or add a dedicated server/API-key signer before live execution."]
        : []),
      ...(!hasAccountId
        ? ["SoDEX account ID is missing. Add SODEX_DEFAULT_ACCOUNT_ID or pass accountId from the connected account."]
        : []),
      ...(symbolId === undefined
        ? [`SoDEX symbol ${parsed.symbol} could not be resolved. Intent stays dry-run until market metadata is live.`]
        : []),
      ...(!hasVerifyingContract
        ? ["SoDEX EIP-712 verifying contract is missing. Add SODEX_EIP712_VERIFYING_CONTRACT before live signing."]
        : []),
    ],
  };

  return {
    ...intentWithoutProof,
    serverProof: signOrderIntent(intentWithoutProof),
  };
}

function readSodexOrderErrors(body: unknown) {
  if (!isRecord(body)) return ["SoDEX returned an unreadable response."];

  const errors: string[] = [];
  const envelopeCode = toNumber(body.code);
  if (envelopeCode !== undefined && envelopeCode !== 0) {
    errors.push(String(body.error ?? `SoDEX API code ${envelopeCode}`));
  }

  const data = body.data;
  if (Array.isArray(data)) {
    data.forEach((item) => {
      if (!isRecord(item)) return;
      const itemCode = toNumber(item.code);
      if (itemCode !== undefined && itemCode !== 0) {
        const clOrdID = typeof item.clOrdID === "string" ? `${item.clOrdID}: ` : "";
        errors.push(`${clOrdID}${String(item.error ?? `order code ${itemCode}`)}`);
      }
    });
  }

  return errors;
}

export async function executeSignedSodexOrder({
  intent,
  signature,
  signerAddress,
  confirmed,
}: {
  intent: OrderIntent;
  signature: string;
  signerAddress: string;
  confirmed?: boolean;
}) {
  if (!confirmed) {
    return {
      dryRun: true,
      message: "Signed submission requires explicit user approval.",
      intent,
    };
  }

  if (!verifyOrderIntentProof(intent)) {
    throw new Error("SoDEX intent proof is invalid. Create a fresh order intent before signing.");
  }

  if (intent.endpoint !== ORDER_ENDPOINT || intent.method !== "POST") {
    throw new Error("SoDEX intent endpoint is not valid for this deployment.");
  }

  if (intent.signingMode === "registered-api-key") {
    throw new Error("Registered API-key order signing is not supported by the browser-wallet submit path.");
  }

  const expectedVerifyingContract =
    SODEX_EIP712_VERIFYING_CONTRACT && isAddress(SODEX_EIP712_VERIFYING_CONTRACT)
      ? SODEX_EIP712_VERIFYING_CONTRACT
      : DEFAULT_EIP712_VERIFYING_CONTRACT;

  if (intent.typedData.domain.verifyingContract.toLowerCase() !== expectedVerifyingContract.toLowerCase()) {
    throw new Error("SoDEX verifying contract changed for this deployment.");
  }

  const recomputedPayloadHash = keccak256(toUtf8Bytes(JSON.stringify(intent.payload)));
  if (
    recomputedPayloadHash !== intent.payloadHash ||
    intent.typedData.message.payloadHash !== intent.payloadHash ||
    intent.typedData.message.nonce !== intent.nonce ||
    intent.headersPreview["X-API-Nonce"] !== String(intent.nonce)
  ) {
    throw new Error("SoDEX intent payload no longer matches the signed payload hash.");
  }

  if (intent.typedData.domain.name !== "spot" || intent.typedData.domain.version !== "1" || intent.typedData.domain.chainId !== CHAIN.chainId) {
    throw new Error("SoDEX intent typed-data domain does not match the current route.");
  }

  const normalizedSignature =
    signature.length === 134 && signature.toLowerCase().startsWith("0x01") ? `0x${signature.slice(4)}` : signature;
  const recoveredAddress = verifyTypedData(
    intent.typedData.domain,
    {
      ExchangeAction: intent.typedData.types.ExchangeAction,
    },
    intent.typedData.message,
    normalizedSignature
  );

  if (getAddress(recoveredAddress) !== getAddress(signerAddress) || getAddress(signerAddress) !== getAddress(intent.walletAddress)) {
    throw new Error("Signature does not match the wallet that created the SoDEX intent.");
  }

  if (process.env.SODEX_ENABLE_LIVE_EXECUTION !== "true") {
    return {
      dryRun: true,
      message: "Live SoDEX execution is disabled. Set SODEX_ENABLE_LIVE_EXECUTION=true after wallet testing.",
      intent,
    };
  }

  if (intent.executionMode !== "ready-for-signature") {
    return {
      dryRun: true,
      message: "This intent is dry-run only. Create a fresh ready-for-signature intent after SoDEX account and contract settings are configured.",
      intent,
    };
  }

  if (!SODEX_EIP712_VERIFYING_CONTRACT || !isAddress(SODEX_EIP712_VERIFYING_CONTRACT)) {
    throw new Error("SODEX_EIP712_VERIFYING_CONTRACT must be configured before live SoDEX execution.");
  }

  const typedSignature = signature.toLowerCase().startsWith("0x01") ? signature : `0x01${signature.replace(/^0x/, "")}`;
  const params = intent.payload;
  if (!isRecord(params)) {
    throw new Error("SoDEX intent payload is missing.");
  }
  if (!Number.isFinite(Number(params.accountID)) || Number(params.accountID) <= 0) {
    throw new Error("SoDEX account ID is missing from the signed intent.");
  }
  if (!Number.isFinite(Number(params.symbolID)) || Number(params.symbolID) <= 0) {
    throw new Error("SoDEX symbol ID is missing from the signed intent.");
  }

  const response = await fetch(ORDER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-API-Nonce": String(intent.nonce),
      "X-API-Sign": typedSignature,
    },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(SODEX_REQUEST_TIMEOUT_MS),
  });

  const body = (await response.json().catch(() => undefined)) as unknown;
  const orderErrors = response.ok ? readSodexOrderErrors(body) : [];
  const submitted = response.ok && orderErrors.length === 0;
  return {
    dryRun: false,
    submitted,
    status: response.status,
    body,
    message: submitted
      ? "Signed SoDEX order submitted."
      : orderErrors[0] ?? `SoDEX rejected order with status ${response.status}.`,
  };
}
