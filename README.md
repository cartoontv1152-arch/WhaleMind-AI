# WhaleMind AI

demo -[https://youtu.be/lFq0Smz6MMU](https://youtu.be/lFq0Smz6MMU)

url - [https://whale-mind-ai.vercel.app](https://whale-mind-ai.vercel.app/)

AI-powered on-chain trading intelligence for SoSoValue research, SoDEX execution, and ValueChain wallet confirmation.

**Wave 2 complete:** wallet-authenticated private beta dashboard, MongoDB-backed saved state, per-asset signal history, SoSoValue Index reads, backtesting, alerts, portfolio snapshots, and signed SoDEX submission gating.

WhaleMind turns SoSoValue market intelligence, ETF flows, news, SoDEX order-book data, and ValueChain wallet execution into one research-to-action workflow:

```txt
SoSoValue data -> WhaleMind signal engine -> AI explanation -> SoDEX order intent -> wallet confirmation
```

## Wave 1 Status

This repository started as the Wave 1 prototype for the SoSoValue/SoDEX buildathon and now includes the Wave 2 private beta workflow.

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

## Completed in Wave 2:

- Added wallet challenge/signature authentication for the private beta dashboard.
- Promoted MongoDB from optional history storage to a Wave 2 readiness gate for saved state and cross-session history.
- Added wallet-owned MongoDB beta state for watchlists, saved signals, alerts, portfolio snapshots, and backtest results.
- Added per-asset signal history derived from persisted dashboard snapshots.
- Added SoSoValue Index support through the official `/indices`, `/indices/{ticker}/market-snapshot`, and `/indices/{ticker}/constituents` endpoints.
- Corrected SoDEX signing semantics: `X-API-Key` is treated as an optional SoDEX API-key name, not a wallet address, and master-wallet signing omits that header.
- Added browser EIP-712 signing with `eth_signTypedData_v4`, server-side signature verification, and guarded `/api/sodex/execute` submission.
- Added testnet/mainnet execution awareness through `SODEX_ENV` and ValueChain network switching.
- Added backtested risk/reward simulation with stop loss, take profit, position sizing, drawdown, and PnL estimates.
- Added Telegram/Discord alert delivery hooks through server-side env vars, with in-app alerts available by default.
- Restructured the dashboard into Research, Execution, Portfolio, and Readiness tabs so workflows are not crowded into one page.
- Replaced dashboard and product accent hardcoded colors with shared CSS tokens.
- Added HttpOnly signed wallet-session cookies so wallet-owned beta state cannot be read or mutated by spoofing a wallet address.
- Added SoSoValue request timeouts and transient retry handling for rate limits/server errors.
- Added webhook response validation so Telegram/Discord alerts are only marked delivered after a successful provider response.
- Sanitized public API error responses so auth, beta-state, dashboard, intelligence, SoDEX, and Mongo persistence failures do not expose infrastructure details.
- Hardened SoSoValue Index parsing for the official `/indices` string-array response, including transient `429` retry handling.
- Gated private SoDEX intent and execute routes behind signed wallet sessions so public pages cannot trigger private execution workflows.
- Added safer SoDEX market symbol validation, response-envelope checks, and dry-run behavior when a symbol cannot be resolved.
- Removed raw upstream/provider error text from public dashboard and signal notes.
- Upgraded the production dependency baseline and verified the production audit is clean.

## Tech Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS, shadcn/ui components
- Data/AI layer: SoSoValue API, OpenAI optional brief generation
- Execution layer: SoDEX REST API, EIP-712 order intent flow
- Chain layer: ValueChain mainnet, ethers.js RPC checks
- Storage: MongoDB-backed dashboard snapshots and wallet-owned beta state
- Auth: wallet challenge signatures plus HttpOnly signed session cookies
- Charts/UI assets: Recharts available, existing v0 media and animations preserved

## Environment

Copy `.env.example` into `.env.local` and fill in secrets. The local secret file is ignored by git.

Secrets belong only in `.env.local` and hosted environment variables. Do not commit real API keys, wallet session secrets, MongoDB credentials, webhook tokens, or SoDEX account identifiers.

Required for Wave 2 private beta readiness:

```bash
SOSOVALUE_API_KEY=...
MONGODB_URI=...
MONGODB_REQUIRED=true
WHALEMIND_SESSION_SECRET=...
```

Optional production settings:

```bash
OPENAI_API_KEY=...
SOSOVALUE_INDEX_TICKERS=ssimag7
SODEX_ENV=mainnet
SODEX_ENABLE_LIVE_EXECUTION=false
SODEX_DEFAULT_ACCOUNT_ID=
SODEX_API_KEY_NAME=
SODEX_EIP712_VERIFYING_CONTRACT=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
DISCORD_WEBHOOK_URL=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`WHALEMIND_SESSION_SECRET` should be a random 32+ character server-only value. Keep `SODEX_ENABLE_LIVE_EXECUTION=false` while testing. The dashboard marks signed submission ready only after the flag and `SODEX_DEFAULT_ACCOUNT_ID` are configured; `SODEX_EIP712_VERIFYING_CONTRACT` is optional because WhaleMind defaults to SoDEX's zero-address EIP-712 verifying contract. If `SODEX_API_KEY_NAME` is set, it is sent as the SoDEX API-key name; otherwise WhaleMind omits `X-API-Key` for master-wallet signing. The dashboard does not render fake candles or placeholder market rows; charts come from the current live refresh plus MongoDB history when configured.

For the current private beta deployment, live SoDEX submission is intentionally disabled with `SODEX_ENABLE_LIVE_EXECUTION=false` until the production account ID, risk limits, and signing contract are fully validated.

## Local Development

```bash
npx --yes pnpm@10.24.0 install
npx --yes pnpm@10.24.0 dev
```

The app runs at `http://localhost:3000` by default.

## Wave 2 Status

Wave 2 now turns the prototype into a private beta:

- Wallet authentication opens the `/dashboard` workspace through a signed challenge.
- Watchlists, saved signals, alerts, portfolio snapshots, and backtests persist by wallet in MongoDB after an HttpOnly signed session cookie is issued.
- Per-asset signal history is available from persisted snapshots so the dashboard does not reset between sessions.
- SoSoValue Indexes are live in the research tab, alongside SoSoValue market assets, ETF flows, hot news, and SoDEX order-book prints.
- The execution tab separates simulation, EIP-712 intent creation, wallet signature, and guarded SoDEX submission.
- Testnet execution can be exercised by setting `SODEX_ENV=testnet` and enabling the guarded execution variables after account/contract validation.
- Telegram and Discord delivery hooks are wired through server-side env vars; missing webhook config and failed provider responses are shown in readiness/results.
- Portfolio-aware beta state is available through manual holdings while full SoDEX account-state integration remains dependent on account IDs and balances.
- The `/api/user-state` route now rejects unsigned writes and cross-wallet session mismatches.

## Verification

Recent hardening was verified with:

```bash
npx --yes pnpm@10.24.0 exec tsc --noEmit --incremental false
npx --yes pnpm@10.24.0 audit --prod
npx --yes pnpm@10.24.0 build
```

The Vercel project is linked through `.vercel/project.json`, with production and preview environment variables configured for SoSoValue, OpenAI, MongoDB, ValueChain, and guarded SoDEX settings.

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
