# Uniswap Agentic Trader Implementation Plan

## Goal

Build an open-source AI trading agent that uses the live Uniswap Developer Platform Trading API with a real API key, submits real on-chain swaps, and demonstrates agentic decision-making without mocks. The project should be hackathon-optimized: small enough to finish quickly, but deep enough to score bonus points through Uniswap AI Skills, Permit2, and optional v4/Unichain support.

## 1. Uniswap API Capabilities

### Minimum endpoints for the hackathon build

- `POST /check_approval`
  - Checks whether the wallet has enough token approval.
  - Returns approval calldata if the wallet must approve Permit2 or token spending.
- `POST /quote`
  - Core route discovery endpoint.
  - Supports `EXACT_INPUT` and `EXACT_OUTPUT`.
  - Accepts `tokenIn`, `tokenOut`, `amount`, `tokenInChainId`, `tokenOutChainId`, `swapper`.
  - Important optional fields:
    - `protocols`: choose among `V2`, `V3`, `V4`
    - `routingPreference`: `BEST_PRICE`, `FASTEST`, `CLASSIC`
    - `slippageTolerance` or `autoSlippage`
    - `hooksOptions` for v4 hook-aware routing
    - `urgency`
    - `permitAmount`
    - `integratorFees`
  - Returns:
    - `routing`
    - executable `quote`
    - optional `permitData`
    - optional `permitTransaction`
- `POST /swap`
  - Converts a quote into unsigned transaction calldata for broadcast.
  - Used for `CLASSIC`, `WRAP`, `UNWRAP`, and `BRIDGE` routing.
- `POST /order`
  - Submits a UniswapX order for gasless execution.
  - Used when `/quote` returns `DUTCH_V2`, `DUTCH_V3`, or `PRIORITY`.
- `GET /swaps`
  - Checks the status of submitted swap transactions.
- `GET /orders`
  - Checks the status of UniswapX orders.

### Valuable advanced endpoints

- `POST /indicative_quote`
  - Cheap exploratory pricing before requesting executable quotes.
  - Good for strategy scanning loops.
- `POST /limit_order_quote`
  - Useful if the agent later supports resting orders.
- `POST /swap_5792`
  - Builds EIP-5792 batch transactions.
  - Good for wallet UX improvements.
- `POST /swap_7702`
  - Builds swap transactions for EIP-7702 delegated wallets.
  - Strong bonus-path feature if time permits.
- `POST /send`
  - Generates send calldata; useful for funding or treasury motions.
- `POST /swappable_tokens`
  - Returns bridgeable token coverage; useful for chain-aware planning.
- `POST /plan` and `GET /plan/{planId}`
  - Execution plan endpoints exposed in the live OpenAPI spec.
  - Treat as optional advanced orchestration, not required for v1 demo.
- LP endpoints:
  - `/lp/approve`, `/lp/create`, `/lp/increase`, `/lp/decrease`, `/lp/claim`, `/lp/migrate`, `/lp/claim_rewards`, `/lp/pool_info`
  - Not needed for the first trading demo, but useful for future “agentic LP manager” expansion.

### Supported chains relevant to this project

The Trading API currently exposes swap support for major chains including Ethereum, Base, Arbitrum, Unichain, and testnets such as Sepolia (`11155111`), Base Sepolia (`84532`), and Unichain Sepolia (`1301`).

### Key routing constraints that affect product design

- UniswapX is not available everywhere.
- Official docs note:
  - UniswapX v2: Ethereum, Arbitrum, Base
  - UniswapX v3: Arbitrum only
  - L2 UniswapX minimum size is 1000 USDC-equivalent
  - Mainnet UniswapX minimum size is 300 USDC-equivalent
- Practical consequence:
  - For a hackathon demo with low-value trades, default to `CLASSIC` routing.
  - Treat UniswapX as a feature flag for larger-value demos.

## 2. Agent Architecture

### Recommended architecture

Use a two-loop architecture:

1. Decision loop
   - Reads market state, wallet state, and risk constraints.
   - Produces a structured trade intent:
     - `chainId`
     - `tokenIn`
     - `tokenOut`
     - `side`
     - `amount`
     - `strategy`
     - `confidence`
     - `maxSlippageBps`
     - `reason`
2. Execution loop
   - Validates balances and allowances.
   - Calls Uniswap Trading API.
   - Simulates or dry-checks locally when possible.
   - Signs and broadcasts the transaction.
   - Tracks resulting TxID and post-trade state.

### Core services

- `market-data service`
  - Polls indicative quotes or executable quotes from Uniswap.
  - Optionally augments with pool snapshots or wallet balances.
- `strategy engine`
  - Encodes explicit rules for momentum, rebalance, or spread capture.
  - Keeps the LLM out of final transaction construction.
- `llm policy layer`
  - Chooses among allowed strategies, explains why, and outputs a typed trade intent.
  - Never receives raw private keys.
  - Never directly submits transactions.
- `risk engine`
  - Position caps
  - per-trade USD cap
  - daily loss cap
  - allowlist of chains and tokens
  - max slippage
  - cooldown between trades
- `execution engine`
  - Handles `/check_approval`, `/quote`, `/swap` or `/order`, signing, broadcast, and confirmation.
- `trade journal`
  - Persists every decision, quote, tx hash, gas cost, and result for demo and judging.

### Why this architecture is hackathon-correct

- The AI is real, but bounded.
- The Uniswap integration is direct and auditable.
- Failures are diagnosable.
- It produces evidence judges can inspect: quote payloads, signed transactions, and real tx hashes.

## 3. Trading Strategy

### Recommended v1 strategy: AI-supervised portfolio rebalancer

This is safer and more demoable than true arbitrage.

#### Inputs

- Wallet balances across 2 to 4 assets
- Target allocation, for example:
  - 40% WETH
  - 30% USDC
  - 20% cbBTC or another blue-chip asset
  - 10% opportunistic budget
- Latest indicative or executable quotes
- Recent price movement window

#### Decision rules

- Rebalance only if drift exceeds threshold, for example 5%.
- Skip trade if expected improvement is less than estimated gas plus slippage cost.
- Let the LLM choose which rebalance candidate to execute first when multiple are valid.
- Only allow trades on a strict token allowlist.

### Optional v1.1 strategy: quote-spread scanner

- Request `indicative_quote` or lightweight `quote` for a basket of pairs.
- Compare:
  - `BEST_PRICE` vs `FASTEST`
  - `V2` vs `V3` vs `V4`
  - Base vs Unichain where bridgeable inventory exists
- Execute only if the scan identifies a materially better route inside risk limits.

### Arbitrage note

Pure on-chain arbitrage is not the right hackathon v1:

- It is operationally harder.
- It often requires faster infra and deeper simulation.
- It is harder to prove cleanly in a short demo.

If the judges ask for “agentic trading”, a disciplined rebalancer with autonomous trade selection is more credible than a fake arbitrage bot.

## 4. Uniswap AI Skills Integration Approach

### Primary integration

Use the `uniswap-ai` repository as a developer-facing companion layer, not as the production execution runtime.

### Practical usage

- Install the repo or reference its structure for local development:
  - `uniswap-trading`
    - Helps the team scaffold Trading API integrations.
  - `uniswap-hooks`
    - Helps the team design a v4-hook bonus path.
  - `uniswap-viem`
    - Helps with viem and wagmi wallet interactions.
  - `uniswap-driver`
    - Useful for planning swaps and liquidity operations.

### Product integration pattern

- Expose internal project prompts or “skills” to the agent:
  - `analyze-market`
  - `propose-trade`
  - `validate-risk`
  - `execute-uniswap-swap`
  - `summarize-trade-result`
- Map those skills to deterministic backend tools.
- Keep the production executor local to your codebase.

### Why this matters for judging

- It shows real use of Uniswap’s AI tooling ecosystem.
- It avoids the mistake of making the live bot depend on an external coding-agent runtime.
- It gives a clean story:
  - Uniswap AI Skills accelerate development.
  - The app itself uses Uniswap Trading API and on-chain execution directly.

### Bonus path

If time permits, add a “Build Mode” command that uses the `uniswap-hooks` skill to scaffold a simple v4 hook concept for future strategy enforcement, such as:

- cooldown hook
- max-trade-size hook
- time-windowed fee adjustment hook

Do not block the swap demo on hook deployment.

## 5. On-Chain Execution Flow

### Classic AMM swap flow

1. Agent selects a trade intent.
2. Backend validates:
   - wallet connected
   - supported chain
   - token allowlist
   - balance available
3. Call `POST /check_approval`.
4. If approval calldata is returned:
   - wallet signs and broadcasts approval transaction
   - wait for confirmation
5. Call `POST /quote`.
6. Inspect `routing`.
7. If `routing` is `CLASSIC`, `WRAP`, `UNWRAP`, or `BRIDGE`:
   - call `POST /swap`
   - receive unsigned transaction object
8. If `routing` is `DUTCH_V2`, `DUTCH_V3`, or `PRIORITY`:
   - sign Permit2 data if returned
   - call `POST /order`
   - store returned order id
9. For `/swap` flow:
   - sign transaction with viem wallet client
   - broadcast through RPC
   - store tx hash
10. Poll confirmation through RPC and optionally `GET /swaps`.
11. Record final result, balances, gas used, and rationale.

### Critical implementation detail

Do not mutate the calldata returned by Uniswap. The docs explicitly warn that transaction `data` must be non-empty and must not be modified.

### Permit2 handling

- If `/quote` returns `permitData`, sign the EIP-712 typed data.
- Submit both `signature` and `permitData` together when required.
- If using delegated smart wallets later, evaluate `generatePermitAsTransaction: true` plus `/swap_7702`.

### Broadcast stack

- Build with `viem` for wallet and public client interactions.
- Use an RPC provider such as Alchemy for broadcast, balance reads, and confirmations.

## 6. Tech Stack and Dependencies

### Recommended stack

- Frontend: Next.js + React + TypeScript
- Backend/API routes: Next.js Route Handlers or a small Node service
- Web3: `viem`, `wagmi`
- Wallet UX: RainbowKit or a lean wagmi connector setup
- State and server actions: TanStack Query or direct server actions
- Validation: `zod`
- Logging: structured JSON logs plus a local SQLite or Postgres trade journal
- LLM layer:
  - OpenAI or Anthropic for agent reasoning
  - strict JSON output schema for trade intents
- Infra:
  - Vercel for frontend
  - server secret storage for `UNISWAP_API_KEY`
  - RPC endpoint from Alchemy

### Suggested package set

- `next`
- `react`
- `typescript`
- `viem`
- `wagmi`
- `@tanstack/react-query`
- `zod`
- `better-sqlite3` or Prisma + Postgres
- `pino`

### Environment variables

- `UNISWAP_API_KEY`
- `RPC_URL_BASE`
- `RPC_URL_BASE_SEPOLIA`
- `RPC_URL_UNICHAIN`
- `WALLET_PRIVATE_KEY` for a controlled demo wallet if backend signing is allowed
- `OPENAI_API_KEY` or equivalent
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` if using WalletConnect

## 7. File Structure

```text
uniswap-agentic-trader/
  README.md
  .env.example
  package.json
  src/
    app/
      page.tsx
      api/
        market/route.ts
        decide/route.ts
        execute/route.ts
        trades/route.ts
    features/
      trading/
        api/
          uniswap-client.ts
          quote-service.ts
          approval-service.ts
          execution-service.ts
        domain/
          trade-intent.ts
          trade-result.ts
          risk-rules.ts
        strategies/
          rebalance-strategy.ts
          spread-scan-strategy.ts
        prompts/
          decide-trade.ts
      wallet/
        wallet-client.ts
        balance-service.ts
      telemetry/
        trade-journal.ts
        logger.ts
      config/
        env.ts
        chains.ts
        tokens.ts
  docs/
    architecture.md
    demo-runbook.md
```

### Design notes

- Keep Uniswap API integration isolated in one feature module.
- Keep strategy logic separate from wallet signing.
- Keep prompts separate from deterministic execution code.

## 8. Build Order

### Phase 1: prove live Uniswap execution

1. Create app shell and environment management.
2. Add wallet connectivity and chain switching.
3. Implement `uniswap-client.ts` with:
   - `/check_approval`
   - `/quote`
   - `/swap`
   - `/order`
   - `/swaps`
4. Hardcode one swap pair and execute one real trade.
5. Capture tx hash and show it in UI.

### Phase 2: add autonomous decision-making

1. Add wallet balance reader.
2. Add rebalancing strategy and typed trade intent schema.
3. Add LLM policy layer that can choose among valid candidate trades.
4. Add risk guardrails and approval gating.
5. Persist trade journal entries.

### Phase 3: polish for demo

1. Add dashboard:
   - current balances
   - last quote
   - chosen strategy
   - latest tx hash
2. Add “auto mode” with time-boxed execution every N minutes.
3. Add markdown README and architecture diagram.
4. Open-source the repo publicly.

### Phase 4: bonus work

1. Add `protocols: ["V4"]` and `hooksOptions` toggle.
2. Add Unichain support.
3. Add a second demo using `PRIORITY` or UniswapX if trade size permits.
4. Prototype a v4 hook concept or hook-aware routing mode.

## 9. How To Get and Use the API Key

### Get the key

1. Go to the Uniswap Developer Portal dashboard:
   - `https://developers.uniswap.org/dashboard/welcome`
2. Sign up or log in with Google, GitHub, or email.
3. Create a developer application or API key in the portal.
4. Copy the issued key and store it in your local environment as `UNISWAP_API_KEY`.

### Use the key

Every Trading API request must include:

```http
x-api-key: <YOUR_UNISWAP_API_KEY>
Content-Type: application/json
Accept: application/json
```

Recommended additional header from Uniswap’s swap integration skill:

```http
x-universal-router-version: 2.0
```

### Example quote request

```bash
curl -X POST https://trade-api.gateway.uniswap.org/v1/quote \
  -H "x-api-key: $UNISWAP_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "type": "EXACT_INPUT",
    "amount": "1000000",
    "tokenInChainId": 8453,
    "tokenOutChainId": 8453,
    "tokenIn": "0x833589fCD6EDB6E08f4c7C32D4f71b54bdA02913",
    "tokenOut": "0x4200000000000000000000000000000000000006",
    "swapper": "0xYourWalletAddress",
    "routingPreference": "BEST_PRICE",
    "protocols": ["V3", "V4"],
    "slippageTolerance": 0.5
  }'
```

## 10. Demo Scenario With Real Transactions

### Recommended demo path

Use a low-value real swap on Base mainnet first, then optionally show testnet support.

### Why Base mainnet is the safest demo

- Reliable liquidity
- Cheap gas relative to Ethereum mainnet
- Official Trading API and UniswapX support
- Easy to show real tx hashes without depending on testnet liquidity quality

### Demo script

1. Fund a demo wallet on Base mainnet with:
   - a small amount of ETH for gas
   - a small amount of USDC
2. Connect wallet in the app.
3. Show current balances.
4. Ask the agent to rebalance toward a target allocation.
5. Agent chooses a concrete trade, for example:
   - swap 2 USDC to WETH on Base
6. App calls `/check_approval`.
7. If needed, user signs approval transaction.
8. App calls `/quote`.
9. App calls `/swap`.
10. User signs and broadcasts the returned transaction.
11. UI displays:
   - selected strategy
   - quote summary
   - route type
   - tx hash
   - explorer link
   - updated balances

### Optional testnet demo

Use Base Sepolia or Unichain Sepolia only if you have already verified live liquidity for your chosen pair. The API supports those chain IDs, but the judging requirement is real functional swaps, so a small mainnet trade is the lower-risk path.

### What to show judges

- Developer Portal with real API key configured
- Source code in public GitHub
- README with setup and architecture
- One approval tx hash if applicable
- One completed swap tx hash
- Trade journal entry showing:
  - decision input
  - chosen trade intent
  - Uniswap quote request
  - response routing
  - final tx hash

## Recommended Scope Decision

### Must-have

- Live Trading API integration with real API key
- One real Base mainnet swap
- Agent selects from at least 2 candidate trades
- Public GitHub repo with README
- Trade history panel with tx hashes

### Nice-to-have

- V4-only or V4-preferred routing toggle
- Unichain support
- Auto mode every 5 minutes
- Limit-order planning

### Bonus

- Hook-aware mode using `hooksOptions`
- 7702 or 5792 transaction path
- Small v4 hook prototype or architecture extension

## Recommended Final Pitch

“Uniswap Agentic Trader is an AI-supervised trading agent that monitors wallet state and live Uniswap liquidity, chooses a trade under explicit risk controls, and executes real on-chain swaps through the Uniswap Trading API. It uses Uniswap’s developer platform directly, records real transaction hashes, and is architected to expand into v4 hooks, Unichain, and Permit2-based advanced execution.”

## Sources

- Uniswap Developer Portal: https://developers.uniswap.org/dashboard/welcome
- Uniswap Trading API docs: https://api-docs.uniswap.org/introduction
- Uniswap API integration guide: https://api-docs.uniswap.org/guides/integration_guide
- Supported chains and tokens: https://api-docs.uniswap.org/guides/supported_chains
- Live Trading API OpenAPI spec: https://trade-api.gateway.uniswap.org/v1/api.json
- Uniswap AI tools repo: https://github.com/Uniswap/uniswap-ai
- Uniswap protocol docs: https://docs.uniswap.org/
