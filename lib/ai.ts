import OpenAI from "openai";

import type { AiSignal, EtfFlow, MarketAsset, NewsItem, WhaleEvent } from "@/lib/whalemind-types";

function compactMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

export function buildDeterministicBrief({
  assets,
  etfFlows,
  whaleEvents,
  signals,
}: {
  assets: MarketAsset[];
  etfFlows: EtfFlow[];
  whaleEvents: WhaleEvent[];
  signals: AiSignal[];
}) {
  const topSignal = signals[0];
  const btcFlow = etfFlows.find((flow) => flow.symbol === "BTC");
  const topWhale = whaleEvents[0];
  const marketBias = topSignal?.action === "BUY" ? "constructive" : topSignal?.action === "SELL" ? "defensive" : "selective";

  return `Market bias is ${marketBias}. ${topSignal?.asset ?? "BTC"} leads the signal board at ${
    topSignal?.confidence ?? 0
  }% confidence. BTC ETF flow is ${btcFlow ? compactMoney(btcFlow.netInflow) : "not loaded"}, and the largest tracked SoDEX/whale print is ${
    topWhale ? compactMoney(topWhale.notionalUsd) : "not loaded"
  }. WhaleMind recommends simulation first, then wallet-signed SoDEX execution only after the user confirms risk.`;
}

export async function generateAiBrief(input: {
  assets: MarketAsset[];
  etfFlows: EtfFlow[];
  news: NewsItem[];
  whaleEvents: WhaleEvent[];
  signals: AiSignal[];
}) {
  if (!process.env.OPENAI_API_KEY) {
    return buildDeterministicBrief(input);
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "You are WhaleMind AI, a concise on-chain market analyst. Give no financial guarantees. Mention risk and execution confirmation.",
        },
        {
          role: "user",
          content: JSON.stringify(input).slice(0, 8000),
        },
      ],
      max_output_tokens: 160,
    });

    return response.output_text || buildDeterministicBrief(input);
  } catch {
    return buildDeterministicBrief(input);
  }
}
