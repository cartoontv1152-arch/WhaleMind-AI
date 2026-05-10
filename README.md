

# WhaleMind AI



demo -[https://youtu.be/lFq0Smz6MMU](https://youtu.be/lFq0Smz6MMU)

url -

AI-powered on-chain trading intelligence for SoSoValue research, SoDEX execution, and ValueChain wallet confirmation.

**Wave 1 complete:** live intelligence reads, guarded SoDEX order intents, wallet-ready ValueChain flow, and a Waves 2-3 product roadmap.

AI-powered on-chain trading intelligence for the SoSoValue Buildathon.

WhaleMind turns SoSoValue market intelligence, ETF flows, news, SoDEX order-book data, and ValueChain wallet execution into one research-to-action workflow:

```txt
SoSoValue data -> WhaleMind signal engine -> AI explanation -> SoDEX order intent -> wallet confirmation
```

## Wave 1 Status

This repository is the Wave 1 prototype for the SoSoValue/SoDEX buildathon.

Completed in Wave 1:

- Preserved the v0 landing template's animation flow, visual rhythm, media assets, section order, and color system.
- Rebranded the product copy and UX around WhaleMind AI without removing the original image/video sections.
- Added live server routes for:
  - `GET /api/intelligence`
  - `GET /api/sodex/markets`
  - `POST /api/sodex/order-intent`
  - `POST /api/sodex/execute`
- Integrated SoSoValue API reads for currency snapshots, ETF summary flow, and hot news.
- Integrated SoDEX public market reads for spot ticker, book ticker, and recent trade-derived flow events.
- Added ValueChain RPC health checks and wallet network switching for chain ID `286623`.
- Added EIP-712 SoDEX order-intent generation with nonce, payload hash, typed data, and signed-write headers preview.
- Added guarded execution: live SoDEX writes stay disabled unless `SODEX_ENABLE_LIVE_EXECUTION=true`.
- Added optional OpenAI brief generation with deterministic fallback when no API key is present.
- Added optional MongoDB persistence for signal snapshots when `MONGODB_URI` is present.
- Added `.env.example` and ignored `.env.local` support for production-safe secrets.
- Added the WhaleMind whale image as the app favicon, Apple icon, OpenGraph preview, and README hero mark.
- Added local verification steps for type checks, production builds, API smoke tests, and browser inspection.
- Added a separate `/dashboard` app surface with wallet-based login, live market charts, SoDEX intent creation, Mongo-backed signal history, and readiness checks.

Wave 1 remaining before demo day:

- Paste the final SoDEX account ID into `SODEX_DEFAULT_ACCOUNT_ID` when the organizer account is available.
- Paste the exchange-specific EIP-712 verifying contract into `SODEX_EIP712_VERIFYING_CONTRACT` when provided.
- Add a real `OPENAI_API_KEY` only if you want dynamic AI text instead of the deterministic analyst brief.
- Add `MONGODB_URI` only if you want persisted signal history during judging.

## Buildathon Fit

WhaleMind directly targets the buildathon theme: agentic Web3 research-to-execution products.

- SoSoValue: market data, ETF flows, hot news, and intelligence inputs.
- SoDEX: order-book market data and execution route.
- ValueChain: wallet network, RPC status, and on-chain execution target.
- AI: signal explanation, risk summaries, and trader-facing decisions.
- One-person finance workflow: scan, explain, simulate, confirm, execute.

## Tech Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS, shadcn/ui components
- Data/AI layer: SoSoValue API, OpenAI optional brief generation
- Execution layer: SoDEX REST API, EIP-712 order intent flow
- Chain layer: ValueChain mainnet, ethers.js RPC checks
- Storage: MongoDB optional signal snapshot persistence
- Charts/UI assets: Recharts available, existing v0 media and animations preserved

## Environment

Copy `.env.example` into `.env.local` and fill in secrets. The local secret file is ignored by git.

Required for live SoSoValue reads:

```bash
SOSOVALUE_API_KEY=...
```

Optional production settings:

```bash
OPENAI_API_KEY=...
MONGODB_URI=...
SODEX_ENABLE_LIVE_EXECUTION=false
SODEX_DEFAULT_ACCOUNT_ID=
SODEX_EIP712_VERIFYING_CONTRACT=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Keep `SODEX_ENABLE_LIVE_EXECUTION=false` while testing. The dashboard marks live execution ready only after the flag, `SODEX_DEFAULT_ACCOUNT_ID`, and `SODEX_EIP712_VERIFYING_CONTRACT` are all configured. The dashboard does not render fake candles or placeholder market rows; charts come from the current live refresh plus MongoDB history when configured.

## Local Development

```bash
npx --yes pnpm@10.24.0 install
npx --yes pnpm@10.24.0 dev
```

The app runs at `http://localhost:3000` by default.

## Wave 2 Roadmap

Wave 2 will turn the prototype into a private beta:

- Wallet authentication and saved user watchlists.
- MongoDB-backed alerts, saved signals, and portfolio snapshots.
- Telegram or Discord alert delivery for high-confidence whale events.
- AI chat assistant that answers questions from current SoSoValue and SoDEX context.
- Backtested simulator for risk/reward, stop loss, and position sizing.
- Testnet signed SoDEX order submission with explicit user approval.
- Narrative pages for BTC, ETH, SOL, XRP, AI, DeFi, and meme rotations.
- Cleaner account-state integration once SoDEX account IDs and user wallets are available.

## Wave 3 Roadmap

Wave 3 will focus on production release:

- Live SoDEX execution after full signing, account, and risk validation.
- Advanced whale wallet ranking based on historical profitability and consistency.
- Portfolio-aware recommendations and multi-asset strategy templates.
- Copy-trading and strategy marketplace experiments.
- Premium AI analyst workspace with saved research memory.
- Team approvals, risk limits, and execution audit logs.
- Billing, usage limits, observability, and deployment hardening.
- Public launch package for the final buildathon demo.

## Safety Model

WhaleMind does not silently place trades. The app separates:

1. Signal generation.
2. Trade simulation.
3. EIP-712 typed-data creation.
4. Wallet signature.
5. Live SoDEX submission.

This keeps the demo useful today while protecting users from accidental live orders.