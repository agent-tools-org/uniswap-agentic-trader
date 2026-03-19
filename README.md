# Uniswap Agentic Trader

An AI-supervised trading agent that monitors live Uniswap liquidity on Base, identifies pricing opportunities, and autonomously executes on-chain swaps through the **Uniswap Trading API**.

Built for the **Agentic Finance (Best Uniswap API Integration)** hackathon track.

## Features

- **Live Uniswap Trading API integration** — full 3-step swap flow (check_approval → quote → swap/order)
- **Indicative quotes** for low-cost price scanning across token pairs
- **Multi-pool routing** — aggregates liquidity across Uniswap V2, V3, and V4 pools for optimal execution
- **Permit2 support** — handles EIP-712 typed data signing for gasless approvals
- **UniswapX gasless orders** — submits Dutch auction orders when available (DUTCH_V2/V3, PRIORITY)
- **AI reasoning** — evaluates opportunities and explains trade decisions
- **Trade journal** — every trade logged to `logs/trades.jsonl` with tx hashes
- **On-chain demo** — reads real Uniswap V3 pool state from Base mainnet (`npm run demo`)
- **Configurable** — supports WETH, USDC, USDT, DAI on Base (chain ID 8453)

## Architecture

The agent follows a four-stage pipeline:

```
Market Intelligence ──▶ Uniswap Trading API ──▶ Swap Execution ──▶ Portfolio Tracking
```

**Market Intelligence** — The scanner polls indicative quotes across all configured
token pairs to build a real-time price matrix, then detects mispricing opportunities
that exceed a configurable threshold.

**Uniswap Trading API** — A unified swap interface that abstracts away individual
pool versions. The API handles multi-pool routing (V2/V3/V4), selects optimal
split routes, and returns ready-to-sign transaction calldata. A single `/quote`
call evaluates every available liquidity source and returns the best price.

**Swap Execution** — The agent checks Permit2 approvals, signs EIP-712 typed
data when needed, and broadcasts the transaction through the Base RPC. For
UniswapX-eligible trades, it submits gasless Dutch auction orders instead.

**Portfolio Tracking** — Every decision, quote payload, tx hash, gas cost, and
result is appended to an immutable trade journal (`logs/trades.jsonl`) for
auditability.

```
┌──────────────────────────────────────────────┐
│             Agent (src/agent/trader.ts)       │
│  1. Scan prices (indicative quotes)          │
│  2. Detect opportunities (strategy/scanner)  │
│  3. AI reasoning: pick best trade            │
│  4. Check approval (Permit2)                 │
│  5. Get executable quote                     │
│  6. Execute swap or submit UniswapX order    │
│  7. Log trade with txHash/orderId            │
└───────────────────┬──────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────┐
│        Uniswap Trading API                   │
│  Unified swap interface — multi-pool routing │
│  /indicative_quote  /check_approval          │
│  /quote  /swap  /order  /swaps  /orders      │
└───────────────────┬──────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────┐
│           Base L2 (Chain ID 8453)            │
│  Permit2 · Universal Router · UniswapX       │
└──────────────────────────────────────────────┘
```

## Getting a Uniswap API Key

1. Visit the [Uniswap Developer Portal](https://developers.uniswap.org/dashboard/welcome)
2. Sign up or log in with Google, GitHub, or email
3. Create a new API key in the dashboard
4. Copy the key — you'll set it as `UNISWAP_API_KEY`

## Quick Demo (no API key required)

The demo script reads real Uniswap V3 pool state directly from Base mainnet
using a public RPC — no wallet or API key needed:

```bash
npm run demo
```

This connects to the WETH/USDC pool, reads the current tick, liquidity, and
fee tier, converts the tick to a human-readable price, and writes the result
to `proof/demo.json`.

## Setup

```bash
# Clone the repo
git clone https://github.com/your-org/uniswap-agentic-trader.git
cd uniswap-agentic-trader

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API key, wallet private key, and RPC URL

# Build
npm run build
```

### API Key Setup

1. Visit the [Uniswap Developer Portal](https://developers.uniswap.org/dashboard/welcome)
2. Sign up or log in with Google, GitHub, or email
3. Create a new API key in the dashboard
4. Copy the key and set it in your `.env` file as `UNISWAP_API_KEY`

The Trading API key is required for the full agent loop (price scanning,
quoting, and swap execution). The `npm run demo` command works without it
since it reads pool state directly from the chain.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `UNISWAP_API_KEY` | Your Uniswap Developer Platform API key |
| `WALLET_PRIVATE_KEY` | Private key for the trading wallet (hex, with 0x prefix) |
| `RPC_URL` | Base mainnet RPC endpoint (default: `https://mainnet.base.org`) |

> ⚠️ **Never commit your `.env` file.** The `.gitignore` already excludes it.

## Usage

### On-Chain Demo (read-only)

```bash
npm run demo
# Reads WETH/USDC pool state from Base mainnet → proof/demo.json
```

### Single Trading Cycle

```bash
npm start
# or
npx ts-node src/index.ts once
```

### Continuous Trading Loop

```bash
npx ts-node src/index.ts loop
# Customize interval via INTERVAL_MS env var (default: 60000ms)
```

### Price Scanner Only

```bash
npm run scan
```

## Example Output

```
============================================================
[trader] Starting trading cycle
[trader] Wallet: 0xYourWalletAddress
[trader] Chain: Base (8453)
============================================================
[scanner] Scanning prices via indicative quotes...
[scanner] Got 12 price snapshots
[scanner] Found 2 opportunities

[trader] Price snapshots:
  WETH  → USDC : 2534.180000
  USDC  → WETH : 0.000395
  USDT  → USDC : 0.999850
  USDC  → USDT : 1.000120

[AI Reasoning] Evaluated 2 opportunity(ies).
  Selected: USDT → USDC
  Deviation: 15.0 bps
  Score: 0.0010
  Rationale: USDT→USDC price 0.999850 deviates 15.0 bps from parity
  Decision: EXECUTE — expected profit exceeds estimated gas cost.

[trader] Getting executable quote: USDT → USDC
[trader] Quote routing: CLASSIC
[trader] Quote output: 0.999850 USDC
[trader] Checking token approval...
[trader] Token already approved.
[trader] Signing Permit2 data...
[trader] Permit2 signature obtained.
[trader] Executing classic swap...
[trader] Broadcasting swap transaction...
[trader] ✅ Swap tx submitted: 0xabc123...
[trader] Swap confirmed in block 12345678 | status: success
[journal] Logged trade: USDT/USDC CONFIRMED
```

## Trade Journal

Every trade is logged to `logs/trades.jsonl`:

```json
{
  "timestamp": "2026-03-18T12:00:00.000Z",
  "pair": "USDT/USDC",
  "direction": "SWAP",
  "amountIn": "1000000",
  "tokenIn": "USDT",
  "tokenOut": "USDC",
  "routing": "CLASSIC",
  "quoteOutput": "999850",
  "txHash": "0xabc123...",
  "status": "CONFIRMED",
  "reason": "USDT→USDC price deviates 15.0 bps from parity",
  "blockNumber": 12345678,
  "gasUsed": "150000"
}
```

## Project Structure

```
src/
├── config.ts              # Environment, chain, tokens
├── index.ts               # Entry point (once / loop modes)
├── scan.ts                # Standalone price scanner
├── logger.ts              # Trade journal (JSONL)
├── uniswap/
│   ├── api.ts             # Uniswap Trading API client
│   ├── permit2.ts         # Permit2 EIP-712 signing
│   └── types.ts           # API request/response types
├── strategy/
│   └── scanner.ts         # Price scanning & opportunity detection
└── agent/
    └── trader.ts          # Main trading agent loop
```

## Uniswap API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `POST /indicative_quote` | Cheap price scanning across pairs |
| `POST /check_approval` | Check Permit2/token approvals |
| `POST /quote` | Get executable swap quote |
| `POST /swap` | Execute classic AMM swap |
| `POST /order` | Submit UniswapX gasless order |
| `GET /swaps` | Check swap tx status |
| `GET /orders` | Check UniswapX order status |

## Key Design Decisions

- **Base mainnet** for reliable liquidity and cheap gas
- **Indicative quotes** for low-cost market scanning (no Permit2 overhead)
- **Classic routing by default** — UniswapX for larger trades when available
- **Deterministic strategy engine** — AI explains decisions but doesn't control tx construction
- **Append-only trade journal** — full audit trail for judges

## License

MIT
