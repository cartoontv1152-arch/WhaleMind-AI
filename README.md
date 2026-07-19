# WhaleMind AI

demo -[https://youtu.be/lFq0Smz6MMU](https://youtu.be/lFq0Smz6MMU)

url - [https://whale-mind-ai.vercel.app](https://whale-mind-ai.vercel.app/)

AI-powered on-chain trading intelligence for SoSoValue research, SoDEX execution, and ValueChain wallet confirmation.

**Wave 3 final release:** production dashboard, wallet-authenticated saved state, SoSoValue market/ETF/news/index/macro reads, official SSI daily klines, SoSoValue rate-limit visibility, per-asset SoDEX route mapping, backtesting, alerts, portfolio snapshots, production health checks, and signed SoDEX submission gating.

WhaleMind turns SoSoValue market intelligence, ETF flows, news, SoDEX order-book data, and ValueChain wallet execution into one research-to-action workflow:

```txt
SoSoValue data -> WhaleMind signal engine -> AI explanation -> SoDEX order intent -> wallet confirmation
```

## Wave 3 Status

WhaleMind AI is now in Wave 3 final production status. The current shipped app is the production workflow deployed at `https://whale-mind-ai.vercel.app`, with live SoSoValue research, Macro and SSI reads, per-asset SoDEX routing, wallet-authenticated saved state, production health checks, and guarded EIP-712 execution.

Wave 1 foundation completed:

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
- Added optional OpenAI brief generation with a deterministic non-trading brief when no API key is present.
- Added optional MongoDB persistence for signal snapshots when `MONGODB_URI` is present.
- Added `.env.example` and ignored `.env.local` support for production-safe secrets.
- Added the WhaleMind whale image as the app favicon, Apple icon, OpenGraph preview, and README hero mark.
- Added local verification steps for type checks, production builds, API smoke tests, and browser inspection.
- Added a separate `/dashboard` app surface with wallet-based login, live market charts, SoDEX intent creation, Mongo-backed signal history, and readiness checks.

## Completed in Wave 2:

- Added wallet challenge/signature authentication for the private dashboard.
- Promoted MongoDB from optional history storage to a Wave 2 readiness gate for saved state and cross-session history.
- Added wallet-owned MongoDB workspace state for watchlists, saved signals, alerts, portfolio snapshots, and backtest results.
- Added per-asset signal history derived from persisted dashboard snapshots.
- Added SoSoValue Index support through the official `/indices`, `/indices/{ticker}/market-snapshot`, and `/indices/{ticker}/constituents` endpoints.
- Corrected SoDEX signing semantics: `X-API-Key` is treated as an optional SoDEX API-key name, not a wallet address, and master-wallet signing omits that header.
- Added browser EIP-712 signing with `eth_signTypedData_v4`, server-side signature verification, and guarded `/api/sodex/execute` submission.
- Added testnet/mainnet execution awareness through `SODEX_ENV` and ValueChain network switching.
- Added backtested risk/reward simulation with stop loss, take profit, position sizing, drawdown, and PnL estimates.
- Added Telegram/Discord alert delivery hooks through server-side env vars, with in-app alerts available by default.
- Restructured the dashboard into Research, Execution, Portfolio, and Readiness tabs so workflows are not crowded into one page.
- Replaced dashboard and product accent hardcoded colors with shared CSS tokens.
- Added HttpOnly signed wallet-session cookies so wallet-owned workspace state cannot be read or mutated by spoofing a wallet address.
- Added SoSoValue request timeouts and transient retry handling for rate limits/server errors.
- Added webhook response validation so Telegram/Discord alerts are only marked delivered after a successful provider response.
- Sanitized public API error responses so auth, workspace-state, dashboard, intelligence, SoDEX, and Mongo persistence failures do not expose infrastructure details.
- Hardened SoSoValue Index parsing for the official `/indices` string-array response, including transient `429` retry handling.
- Gated private SoDEX intent and execute routes behind signed wallet sessions so public pages cannot trigger private execution workflows.
- Added safer SoDEX market symbol validation, response-envelope checks, and dry-run behavior when a symbol cannot be resolved.
- Removed raw upstream/provider error text from public dashboard and signal notes.
- Upgraded the production dependency baseline and verified the production audit is clean.

## Wave 3 Final Production Scope

- Verified the current SoSoValue API docs online for base URL, `x-soso-api-key`, unified response format, 20 requests/minute rate limit, Index endpoints, daily Index klines, and Macro endpoints.
- Added official SoSoValue Macro calendar support through `GET /macro/events` and tracked event history through `GET /macro/events/{event}/history`.
- Added official SoSoValue Index daily kline reads through `GET /indices/{index_ticker}/klines` and surfaced the SSI trend in the Research tab.
- Added SoSoValue rate-limit tracking from response headers and 429 cooldown handling so server refreshes do not keep hammering the API key.
- Added stale-cache serving during SoSoValue cooldown/transient failures so temporary 429s do not immediately blank live panels.
- Made market, ETF, index, macro, and refresh settings configurable through env vars instead of fixed source lists.
- Added per-asset SoDEX route mapping through `SODEX_SYMBOL_MAP`, with verified default routes for BTC, ETH, SOL, and XRP.
- Fixed the execution tab so the selected signal asset drives the SoDEX symbol used for order intent creation.
- Changed SoDEX order hashing so the EIP-712 payload hash signs the exact JSON body submitted to the live order endpoint.
- Added collision-resistant SoDEX intent IDs/nonces instead of timestamp-only identifiers.
- Added `GET /api/health` for deployment readiness checks without exposing secrets or spending SoSoValue quota.
- Removed non-live market data from production routes; unavailable providers now return partial/live-source states and empty UI states.
- Changed public and authenticated refresh cadence to a 60-second server floor with in-flight request de-duplication to fit the documented SoSoValue quota.
- Replaced remote landing-page media and Google font imports with bundled assets and system font stacks for China/restricted-network rendering.
- Removed unimplemented landing claims, fabricated testimonials, and placeholder links; the public site now only advertises implemented product surfaces.
- Updated the dashboard copy from beta wording to production wording and added Macro, SoSoValue quota, route, and readiness panels.

## Tech Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS, shadcn/ui components
- Data/AI layer: SoSoValue API, OpenAI optional brief generation
- Execution layer: SoDEX REST API, EIP-712 order intent flow
- Chain layer: ValueChain mainnet, ethers.js RPC checks
- Storage: MongoDB-backed dashboard snapshots and wallet-owned workspace state
- Auth: wallet challenge signatures plus HttpOnly signed session cookies
- Charts/UI assets: Recharts plus bundled landing media and animations

## Environment

Copy `.env.example` into `.env.local` and fill in secrets. The local secret file is ignored by git.

Secrets belong only in `.env.local` and hosted environment variables. Do not commit real API keys, wallet session secrets, MongoDB credentials, webhook tokens, or SoDEX account identifiers.

Required for production readiness:

```bash
SOSOVALUE_API_KEY=...
SOSOVALUE_REFRESH_SECONDS=60
SOSOVALUE_STALE_SECONDS=900
MONGODB_URI=...
MONGODB_REQUIRED=true
WHALEMIND_SESSION_SECRET=...
```

Optional production settings:

```bash
OPENAI_API_KEY=...
SOSOVALUE_INDEX_TICKERS=ssimag7
SOSOVALUE_MARKET_SYMBOLS=BTC,ETH,SOL,XRP
SOSOVALUE_ETF_SYMBOLS=BTC,ETH
SOSOVALUE_MACRO_EVENTS=CPI,Nonfarm Payrolls
SODEX_ENV=mainnet
SODEX_SYMBOL_MAP=BTC:vBTC_vUSDC,ETH:vETH_vUSDC,SOL:vSOL_vUSDC,XRP:vXRP_vUSDC
SODEX_ENABLE_LIVE_EXECUTION=false
SODEX_DEFAULT_ACCOUNT_ID=
SODEX_API_KEY_NAME=
SODEX_EIP712_VERIFYING_CONTRACT=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
DISCORD_WEBHOOK_URL=
NEXT_PUBLIC_APP_URL=https://whale-mind-ai.vercel.app
```

`WHALEMIND_SESSION_SECRET` should be a random 32+ character server-only value. Keep `SODEX_ENABLE_LIVE_EXECUTION=false` while testing. Live SoDEX submission requires `SODEX_DEFAULT_ACCOUNT_ID`, `SODEX_EIP712_VERIFYING_CONTRACT`, and browser-wallet master signing mode. If `SODEX_API_KEY_NAME` is set, WhaleMind keeps the intent in preview/dry-run mode because API-key signing requires a dedicated server/API-key signer rather than the browser wallet.

The dashboard does not render fabricated candles, fabricated market rows, or non-live provider data. Charts come from the current live refresh plus MongoDB history when configured. Dashboard snapshots are cached server-side for 60 seconds and persisted once per live refresh to avoid duplicate history rows. If a provider is unavailable, the app returns a partial state with source notes and empty UI panels.

MongoDB production note: if a configured MongoDB/Atlas endpoint is unreachable because of DNS, firewall, or regional routing, WhaleMind keeps wallet challenges and workspace state usable in server memory for the current runtime and shows a MongoDB source note. Use a China-reachable MongoDB endpoint or direct connection string for durable cross-session history.

SoSoValue production note: the official docs list a per-key limit of 20 requests/minute and 100,000 requests/month. WhaleMind uses server-side caching, in-flight de-duplication, a 60-second refresh floor, stale serving, and 429 cooldown handling based on `retry_after`/rate-limit headers.

China readiness note: browser-facing SoSoValue calls are proxied through Next.js API routes, landing media uses bundled `public/images/*` assets, and fonts use system stacks instead of Google font downloads. If SoSoValue access requires a regional gateway, set `SOSOVALUE_BASE_URL` to the approved gateway while preserving the `/openapi/v1` API shape.

Live SoDEX submission should stay disabled with `SODEX_ENABLE_LIVE_EXECUTION=false` until the production account ID, risk limits, and signing contract are fully validated.

## Vercel Deployment

The Vercel project is linked through `.vercel/project.json`. Repository deployment settings are versioned in `vercel.json`:

- Framework: `nextjs`
- Install command: `npx --yes pnpm@10.24.0 install --frozen-lockfile`
- Build command: `npx --yes pnpm@10.24.0 build`
- Function region: `hkg1` for China-adjacent latency
- Health route: `/api/health`
- Upload ignore: `.vercelignore` excludes local env files, build output, dependencies, and Playwright artifacts

Configure all required secrets in Vercel Project Settings for Production and Preview. Do not commit real values. A production deployment should report `state: "ready"` from `/api/health`; if it returns `503`, fix the listed readiness check before promoting live traffic. The current production alias is `https://whale-mind-ai.vercel.app`.

## Local Development

```bash
npx --yes pnpm@10.24.0 install
npx --yes pnpm@10.24.0 dev
```

The app runs at `http://localhost:3000` by default.

## Production Status

Wave 3 turns the prototype into a deployable production workflow once `/api/health` reports ready:

- Wallet authentication opens the `/dashboard` workspace through a signed challenge.
- Watchlists, saved signals, alerts, portfolio snapshots, and backtests persist by wallet in MongoDB after an HttpOnly signed session cookie is issued.
- Per-asset signal history is available from persisted snapshots so the dashboard does not reset between sessions.
- SoSoValue Indexes, official daily Index klines, Macro calendar events, market assets, ETF flows, hot news, and SoDEX order-book prints are live in the research tab.
- The execution tab separates simulation, EIP-712 intent creation, wallet signature, and guarded SoDEX submission.
- Testnet execution can be exercised by setting `SODEX_ENV=testnet` and enabling the guarded execution variables after account/contract validation.
- Telegram and Discord delivery hooks are wired through server-side env vars; missing webhook config and failed provider responses are shown in readiness/results.
- Portfolio-aware workspace state is available through manual holdings while full SoDEX account-state integration remains dependent on account IDs and balances.
- The `/api/user-state` route rejects unsigned writes and cross-wallet session mismatches.
- The app surfaces SoSoValue quota state and source notes instead of hiding provider failures behind fabricated data.
- MongoDB outages no longer block wallet challenge creation; the app degrades to in-memory workspace state and reports the persistence warning.

## Verification

Recent hardening was verified with:

```bash
npx --yes pnpm@10.24.0 test
npx --yes pnpm@10.24.0 exec tsc --noEmit --incremental false
npx --yes pnpm@10.24.0 audit --prod
npx --yes pnpm@10.24.0 build
```

For the full local gate, run:

```bash
npx --yes pnpm@10.24.0 verify
```

`pnpm test` runs a static production guard for the audit regressions: no placeholder/dead landing links, no stale beta UI wording, no unimplemented landing claims, selected-asset SoDEX intents, exact-body SoDEX payload hashing, collision-resistant saved-state IDs, and documented SoSoValue hot-news timestamps.

Deployment note: the Vercel project is configured for Node.js `22.x`. A suspended legacy Supabase marketplace resource was disconnected from this project because WhaleMind uses MongoDB and the suspended integration prevented Vercel from provisioning new deployments.

Production deployment verified on the Vercel alias:

- Latest manual production deployment: `dpl_3iUHEZgwas97pigGWA88xVJCDCFD`
- Alias: `https://whale-mind-ai.vercel.app`
- Health: `ready` in region `hkg1`
- Dashboard API state: `live`
- Live returned: 4 assets, 4 signals, 1 SoSoValue index, 2 macro calendar days, 1 tracked macro history, 5 hot news rows, and BTC/ETH/SOL/XRP SoDEX routes
- Wallet execution proof: wallet challenge, HttpOnly session, vETH SoDEX intent, EIP-712 signature verification, and guarded dry-run execute passed against production.

## SoSoValue Docs Verified

Checked online for Wave 3:

- Introduction: `https://sosovalue-1.gitbook.io/sosovalue-api-doc`
- Rate limit: `https://sosovalue-1.gitbook.io/sosovalue-api-doc/rate-limit`
- SoSoValue Index: `https://sosovalue-1.gitbook.io/sosovalue-api-doc/3.-sosovalue-index/index`
- Macro: `https://sosovalue-1.gitbook.io/sosovalue-api-doc/8.-macro/macro`

## Safety Model

WhaleMind does not silently place trades. The app separates:

1. Signal generation.
2. Trade simulation.
3. EIP-712 typed-data creation.
4. Wallet signature.
5. Live SoDEX submission.

This keeps the demo useful today while protecting users from accidental live orders.
