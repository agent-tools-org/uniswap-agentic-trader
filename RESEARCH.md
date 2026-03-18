# Uniswap Agentic Trader — Comprehensive Research Report

**Date:** 2026-03-18

---

## Table of Contents

1. [Uniswap Developer Platform / Trading API](#1-uniswap-developer-platform--trading-api)
2. [Uniswap AI Skills](#2-uniswap-ai-skills)
3. [Existing Uniswap Trading Bots](#3-existing-uniswap-trading-bots)
4. [UniswapX and Gasless Orders](#4-uniswapx-and-gasless-orders)
5. [Permit2 Integration](#5-permit2-integration)
6. [Uniswap v4 Hooks](#6-uniswap-v4-hooks)
7. [Architecture Recommendations for an Agentic Trader](#7-architecture-recommendations-for-an-agentic-trader)

---

## 1. Uniswap Developer Platform / Trading API

### Overview

The Uniswap Trading API is a hosted REST API that provides a streamlined interface for executing swaps across Uniswap protocols (v2, v3, v4) and UniswapX. It abstracts away the complexity of routing, encoding calldata, and managing approvals.

**Base URL:** `https://trade-api.gateway.uniswap.org/v1`

### Authentication

- Requires an **API key** passed via the `x-api-key` HTTP header
- API keys are obtained from the **Uniswap Developer Platform** (https://app.uniswap.org/developers or https://developer.uniswap.org)
- **Critical:** Never hardcode API keys. Use environment variables (e.g., `UNISWAP_API_KEY`)
- The API key can optionally be configured with **service fees** taken from the output token

### Core Endpoints

The Trading API follows a **3-step flow**: `check_approval` → `quote` → `swap/order`

#### 1. `/check_approval`
- Checks if the user's wallet has granted the necessary approval to the Permit2 (or Proxy) contract
- If approval is missing, returns a transaction for the user to sign
- If the wallet already has approval, returns `null` for the approval value
- Supports `includeGasInfo: true` to include gas estimation
- Handles tokens that require resetting approval before re-approving (auto-includes cancellation tx)

#### 2. `/quote`
- Requests a quote for a swap, bridge, or wrap/unwrap operation
- Specifies execution paths through the `protocols` array (Uniswap AMM pools or UniswapX)
- Returns the most efficient route, estimated gas fees, and simulates the proposed route
- If simulation fails, returns an error message
- Returns a **Permit2 message** for signature if necessary

#### 3. `/swap` (gasful — classic routing)
- For swaps filled by classic v2, v3, or v4 Uniswap protocol pools, bridges, or token wraps/unwraps
- **Gasful**: the swapping wallet writes the transaction and pays gas
- The quote response should be spread directly into the `/swap` body (don't wrap in `{quote: ...}`)
- For **CLASSIC** routes: include both `signature` and `permitData` in the body

#### 4. `/order` (gasless — UniswapX routing)
- For swaps filled by UniswapX RFQ market makers
- **Gasless**: the market maker writes the transaction (swapper pays no gas)
- For **UniswapX** routes (DUTCH_V2, DUTCH_V3, PRIORITY): include only `signature` (omit `permitData`)

### Supported Routing Types

| Type | Description |
|------|-------------|
| `CLASSIC` | Traditional AMM pool routing (v2/v3/v4) |
| `DUTCH_V2` | UniswapX Dutch auction v2 |
| `DUTCH_V3` | UniswapX Dutch auction v3 |
| `PRIORITY` | MEV-protected priority orders |
| `WRAP_UNWRAP` | ETH ↔ WETH conversion |

### Error Codes

| Code | Meaning |
|------|---------|
| 400 | Bad request (malformed parameters) |
| 401 | Unauthorized (invalid API key) |
| 429 | Rate limited |
| 500 | Internal server error |

### Rate Limits

Rate limits are enforced per API key. Exceeding limits returns HTTP 429. Specific numeric limits are not publicly documented but are associated with the API key tier.

### Browser Considerations

- The Trading API has **CORS restrictions** — browser-based frontends need a CORS proxy
- Browser environments need a **Buffer polyfill**

**Sources:**
- https://docs.uniswap.org/api/
- https://api-docs.uniswap.org/
- Uniswap AI `swap-integration` SKILL.md (Uniswap/uniswap-ai repo)

---

## 2. Uniswap AI Skills

### Repository: `Uniswap/uniswap-ai`

**URL:** https://github.com/Uniswap/uniswap-ai

The Uniswap AI Skills repository is a **plugin marketplace** that provides AI agents with Uniswap-specific capabilities. Skills are designed to be **agent-agnostic** — usable by any LLM agent, not tied to a specific AI vendor.

### Installation

```bash
# Add marketplace
/plugin marketplace add uniswap/uniswap-ai

# Or via npx
npx skills add Uniswap/uniswap-ai

# Install specific plugins
/plugin install uniswap-trading@uniswap-ai
/plugin install uniswap-hooks
```

### Plugin Architecture

Skills are organized as:
```
packages/plugins/<plugin-name>/skills/<skill-name>/SKILL.md
```

Each skill has:
- A `SKILL.md` file with frontmatter (name, description, license, metadata.author)
- Documentation in `docs/skills/<skill-name>.md`
- Registration in the parent plugin's `plugin.json` skills array

### Available Plugins & Skills

| Plugin | Skills | Purpose |
|--------|--------|---------|
| **uniswap-trading** | `swap-integration`, `pay-with-any-token` | Swap execution via Trading API, cross-chain payments |
| **uniswap-hooks** | `v4-security-foundations` | Security patterns for v4 hook development |
| **uniswap-cca** | `configurator`, `deployer` | Continuous Clearing Auction configuration & deployment |
| **uniswap-driver** | `swap-planner`, `liquidity-planner` | Swap and liquidity planning for agents |
| **uniswap-viem** | `viem-integration` | Viem library integration with Uniswap |

### Key Skill Details

#### `swap-integration` (uniswap-trading)
The most relevant skill for an agentic trader:
- Integrates Uniswap swaps into frontends, backends, and smart contracts
- Uses Trading API with `x-api-key` header
- Follows the 3-step flow: `/check_approval` → `/quote` → `/swap`
- Handles Permit2 differences between CLASSIC and UniswapX routes
- Supports Universal Router SDK for advanced command encoding (V3_SWAP_EXACT_IN, WRAP_ETH, PERMIT2_TRANSFER_FROM, etc.)
- Includes validation helpers and TypeScript type safety via discriminated unions
- Key contract addresses:
  - Universal Router (Ethereum): `0x66a9893cc07d91d95644aedd05d03f95e1dba8af`
  - Permit2 (universal): `0x000000000022D473030F116dDEE9F6B43aC78BA3`

#### `pay-with-any-token` (uniswap-trading)
- Pays HTTP 402 payment challenges using tokens via Uniswap Trading API
- Supports MPP v1 and x402 v1 protocols
- Multi-step flow: detect 402 → identify payment → check balances → swap → bridge → pay
- Cross-chain support (Ethereum, Base, Tempo)
- Requires `UNISWAP_API_KEY` and `PRIVATE_KEY` environment variables

#### `configurator` (uniswap-cca)
- Configures Continuous Clearing Auction (CCA) smart contract parameters
- Interactive bulk form flow for auction setup
- Multi-chain deployment across EVM chains

### Design Principles

- **Agent-agnostic**: No vendor lock-in; works with any LLM agent
- **Model-agnostic prompts**: Skills are markdown documentation, not code
- **Security-first**: Requires user confirmation before any transaction via `AskUserQuestion`
- **Input validation**: All addresses must match `^0x[a-fA-F0-9]{40}$`; reject shell metacharacters

**Sources:**
- https://github.com/Uniswap/uniswap-ai
- SKILL.md files in each plugin's skills directory

---

## 3. Existing Uniswap Trading Bots

### Notable Open-Source Projects

#### 1. Uniswap Trader MCP
- **Type:** MCP (Model Context Protocol) server for AI agents
- **Features:** Automates token swaps across multiple blockchains
- **Chains:** Ethereum, Optimism, Polygon, Arbitrum, Celo, BNB Chain, Avalanche, Base
- **Capabilities:** Real-time price quotes, swap execution with slippage tolerance, trading suggestions

#### 2. Market Maker Bot
- **Type:** Liquidity pool market maker
- **Strategy:** Buys and sells tokens to maintain target price in a pool
- **Supports:** Any pair on Uniswap v3 on EVM-compatible chains
- **Setup:** Fork repo → install libs → set API keys → specify tokens/target prices

#### 3. Uniswap/Sushiswap Arbitrage Bots
- **Type:** Cross-DEX arbitrage
- **Language:** JavaScript
- **Strategy:** Identifies price differences between Uniswap V2 and SushiSwap
- **Variants:** Flash swap version (borrows tokens) and normal swap version (requires holding tokens)

#### 4. Uniswap Sniper Bot
- **Type:** Liquidity sniping
- **Strategy:** Monitors liquidity additions, buys tokens before price rises
- **Tech:** Uses BloXroute streams, pre-generates transactions with probable gas prices

#### 5. Uniswap MEV Arbitrage Bot
- **Type:** MEV extraction
- **Language:** Solidity smart contracts
- **Focus:** WETH liquidity pairs on Ethereum

### Architecture Patterns Observed

1. **Price Monitoring Loop**: Continuously query pool prices via SDK or subgraph
2. **Opportunity Detection**: Compare prices across DEXs or pools
3. **Transaction Construction**: Use SDK/Router to build swap calldata
4. **Gas Optimization**: Pre-compute gas, use flashbots/private mempool
5. **Execution & Confirmation**: Submit tx, monitor receipt, handle reverts

### Projects Using the New Developer Platform API

The **Uniswap Trader MCP** and the **uniswap-ai skills** (particularly `swap-integration`) are the primary examples of projects built on the new Developer Platform / Trading API. Most older bots interact directly with smart contracts via ethers.js/web3.py rather than the hosted API.

**Sources:**
- GitHub search results for "uniswap trading bot"
- https://github.com/Uniswap/uniswap-ai

---

## 4. UniswapX and Gasless Orders

### Overview

UniswapX is a **permissionless, open-source, auction-based** swapping protocol. It aggregates liquidity from AMMs and other sources to provide better prices, gas-free swapping, MEV protection, and elimination of failed transaction costs.

### How It Works

1. **Swapper** creates a **signed order** specifying the desired swap parameters (input token, output token, amounts, deadlines)
2. Orders are broadcast publicly and use **Permit2** to authorize token transfers
3. **Fillers** (sophisticated entities) monitor the public order mempool
4. Fillers compete to fill orders by providing the best execution
5. The first successful filler claims the swap

### Dutch Auction Mechanism

- Orders start at a price **better than estimated market price** (maximum output)
- The price **decays over time** toward the worst price the swapper accepts (minimum output)
- The realized price is determined by **when the order is included in a block**
- This mechanism encourages fillers to fill quickly while ensuring competitive pricing
- Price decay can be based on **block timestamp** or **block number**

### Order Types

| Type | Description | Key Feature |
|------|-------------|-------------|
| **DUTCH_V1** | Original Dutch auction | Basic time-decay pricing |
| **DUTCH_V2** | Improved Dutch auction | Enhanced decay curves, multi-output support |
| **DUTCH_V3** | Latest Dutch auction | Further optimizations |
| **PRIORITY** | Priority fee bidding | MEV-protected; uses priority fee instead of time-decay |
| **Hybrid** | Combined Dutch + Priority | Supports both price curves and basefee scaling |

### Chain-Specific Optimizations

UniswapX operates different auction mechanisms per chain, optimized for each blockchain's characteristics (block times, MEV landscape, etc.).

### Benefits for an AI Trading Agent

1. **Gasless Execution**: The agent doesn't need to manage gas — fillers pay gas. This simplifies the agent's wallet management and reduces operational costs.
2. **MEV Protection**: Orders are protected from sandwich attacks and front-running, which is critical for an autonomous agent that can't manually verify execution quality.
3. **Better Pricing**: Competition among fillers often yields better prices than direct AMM routing.
4. **No Failed Transactions**: Since fillers bear the execution risk, the agent never pays for failed swaps.
5. **Simplified Flow**: The agent only needs to sign orders (off-chain), not construct and submit complex on-chain transactions.
6. **Cross-Liquidity Access**: UniswapX aggregates liquidity from multiple sources beyond Uniswap AMM pools.

**Sources:**
- https://docs.uniswap.org/contracts/uniswapx/overview
- https://uniswap.org (UniswapX documentation)
- https://github.com/Uniswap/UniswapX

---

## 5. Permit2 Integration

### Overview

Permit2 is a **universal token approval contract** developed by Uniswap that revolutionizes how ERC-20 token approvals work. It replaces the need for individual `approve()` calls to each contract.

**Universal Contract Address:** `0x000000000022D473030F116dDEE9F6B43aC78BA3` (same on all chains)

### How It Works

Instead of approving each DEX/protocol individually, users:
1. **Approve Permit2 once** for each token (standard ERC-20 approve)
2. **Sign typed data messages** (off-chain, gasless) to authorize specific transfers
3. Permit2 validates the signature and executes the transfer

### Two Transfer Modes

#### `AllowanceTransfer`
- User sets an allowance for a spender (e.g., Universal Router) with Permit2
- Specifies: token, amount, expiration, spender
- Persistent allowance that can be reused until expiration or revocation
- More suitable for repeated interactions with the same protocol

#### `SignatureTransfer`
- One-time authorization via off-chain signature
- No initial on-chain `approve` to the spender needed (beyond the initial Permit2 approval)
- Uses nonces to prevent replay attacks
- Each transfer requires a new signature
- More suitable for one-off or agent-initiated swaps

### Integration with Uniswap Trading API

The Trading API handles Permit2 differently based on route type:

| Route | Permit2 Handling |
|-------|-----------------|
| **CLASSIC** (v2/v3/v4) | Include both `signature` and `permitData` in `/swap` body |
| **DUTCH_V2/V3** (UniswapX) | Include only `signature` (omit `permitData`) |
| **PRIORITY** (UniswapX) | Include only `signature` (omit `permitData`) |

### Benefits for an Agentic Trader

1. **Single Approval**: Approve Permit2 once, then use signed messages for all future swaps
2. **Gasless Authorizations**: Off-chain signatures mean no gas cost for approvals
3. **Granular Control**: Each signature specifies exact amount, deadline, and recipient
4. **Revocation**: Users can revoke allowances granted to specific spenders
5. **Expiration**: Allowances can have expiration timestamps, limiting exposure
6. **Security**: Nonce-based replay protection; no unlimited approvals to individual contracts

### Conceptual Code Flow

```typescript
// 1. One-time: Approve Permit2 for the token
const approveTx = await token.approve(PERMIT2_ADDRESS, MaxUint256);

// 2. For each swap: Sign a Permit2 message (gasless)
const permit = {
  permitted: { token: tokenAddress, amount: swapAmount },
  spender: UNIVERSAL_ROUTER_ADDRESS,
  nonce: currentNonce,
  deadline: Math.floor(Date.now() / 1000) + 3600
};
const signature = await wallet.signTypedData(domain, types, permit);

// 3. Include in swap request
const swapResponse = await fetch('/swap', {
  body: JSON.stringify({ ...quoteResponse, signature, permitData: permit })
});
```

**Sources:**
- https://docs.uniswap.org/contracts/permit2/overview
- Uniswap AI `swap-integration` SKILL.md
- https://github.com/Uniswap/permit2

---

## 6. Uniswap v4 Hooks

### Overview

Uniswap v4 (launched January 30, 2025) introduces **hooks** — smart contracts that allow developers to customize pool behavior at different lifecycle stages. Hooks function as plugins, enabling custom logic to execute at specific points during pool operations.

### Architecture

- **Singleton Contract**: All pools are managed by a single contract (reduces gas, simplifies multi-hop)
- **Flash Accounting**: Settles net balances at the end of a transaction (further gas reduction)
- **Hook Addresses**: Determined by address flags that encode which hook functions are active

### Hook Lifecycle Points

Hooks can be triggered **before** or **after** these key actions:

| Hook Point | When |
|------------|------|
| `beforeInitialize` / `afterInitialize` | Pool creation |
| `beforeAddLiquidity` / `afterAddLiquidity` | Adding liquidity |
| `beforeRemoveLiquidity` / `afterRemoveLiquidity` | Removing liquidity |
| `beforeSwap` / `afterSwap` | Swap execution |
| `beforeDonate` / `afterDonate` | Donations to pool |

### Hook Patterns for Agentic Trading

#### 1. Dynamic Fee Hooks
- Adjust fees based on market conditions (volatility, volume)
- An agent could deploy/manage pools with fees that automatically optimize for market conditions
- **Use Case**: Agent creates pools with higher fees during volatility spikes, lower during calm markets

#### 2. Limit Order Hooks
- Create on-chain limit orders that execute only under specific conditions
- **Use Case**: Agent places take-profit and stop-loss orders directly in the pool

#### 3. MEV Protection Hooks
- Implement mechanisms to protect against sandwich attacks
- **Use Case**: Agent operates pools with built-in MEV protection for better execution

#### 4. Oracle Hooks
- Advanced on-chain price oracles integrated into pool operations
- **Use Case**: Agent uses hook-based oracles for more accurate pricing decisions

#### 5. TWAMM (Time-Weighted Average Market Maker) Hooks
- Execute large orders over time to minimize price impact
- **Use Case**: Agent splits large trades into time-weighted chunks

#### 6. Automated Buyback Hooks
- Protocols automatically buy tokens when price drops below threshold
- **Use Case**: Agent-managed treasury that auto-rebalances

#### 7. Whitelist/Access Control Hooks
- Restrict pool access to specific addresses
- **Use Case**: Agent operates permissioned pools for specific strategies

#### 8. Custom AMM Curves
- Beyond standard x*y=k — implement concentrated liquidity curves, bonding curves, etc.
- **Use Case**: Agent deploys specialized pools for specific trading strategies

### Development Resources

| Resource | URL |
|----------|-----|
| Uniswap Foundation Hook Template | https://github.com/uniswapfoundation/v4-template |
| OpenZeppelin Hooks Library | https://openzeppelin.com (Solidity library for secure hooks) |
| Scaffold Hook (dev stack) | https://github.com/uniswapfoundation/scaffold-hook |
| Hook Mine And Sinker | Tool to mine addresses for v4 hooks |
| Hook Deployer | Tool to deploy hooks to Ethereum |

### Uniswap AI `v4-security-foundations` Skill

The `uniswap-hooks` plugin provides a `v4-security-foundations` skill that covers security patterns and best practices for developing v4 hooks, essential for any production agentic trader that deploys custom hooks.

**Sources:**
- https://docs.uniswap.org/contracts/v4/overview
- https://threesigma.xyz (v4 hooks analysis)
- https://github.com/Uniswap/v4-core
- Uniswap AI `v4-security-foundations` SKILL.md

---

## 7. Architecture Recommendations for an Agentic Trader

### Recommended Tech Stack

```
┌─────────────────────────────────────────────┐
│              AI Agent (LLM)                 │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  │
│  │ Strategy │  │ Risk Mgmt│  │ Execution │  │
│  │ Engine   │  │ Module   │  │ Planner   │  │
│  └────┬─────┘  └─────┬────┘  └─────┬─────┘  │
│       └──────────┬───┘──────────────┘        │
│                  ▼                            │
│     ┌────────────────────────┐               │
│     │  Uniswap AI Skills     │               │
│     │  (swap-integration,    │               │
│     │   swap-planner,        │               │
│     │   liquidity-planner)   │               │
│     └───────────┬────────────┘               │
└─────────────────┼───────────────────────────┘
                  ▼
┌─────────────────────────────────────────────┐
│         Uniswap Trading API                 │
│  /check_approval → /quote → /swap or /order │
└─────────────────┬───────────────────────────┘
                  ▼
┌─────────────────────────────────────────────┐
│         On-Chain Execution                  │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐ │
│  │ Permit2  │ │Universal │ │  UniswapX   │ │
│  │          │ │ Router   │ │  (Gasless)  │ │
│  └──────────┘ └──────────┘ └─────────────┘ │
│  ┌──────────┐ ┌──────────┐                  │
│  │ v4 Pools │ │ v4 Hooks │                  │
│  └──────────┘ └──────────┘                  │
└─────────────────────────────────────────────┘
```

### Key Integration Points

1. **Use the Trading API** as the primary swap interface (not direct contract calls)
2. **Leverage UniswapX** for gasless execution and MEV protection
3. **Use Permit2 SignatureTransfer** for one-time authorizations per swap
4. **Install Uniswap AI Skills** for agent-native Uniswap capabilities
5. **Consider v4 Hooks** for custom on-chain strategies (dynamic fees, limit orders)

### Environment Variables Required

```bash
UNISWAP_API_KEY=<from developer platform>
PRIVATE_KEY=<wallet private key — never commit>
RPC_URL=<Ethereum/Base/etc. RPC endpoint>
```

### Security Checklist

- [ ] Never hardcode API keys or private keys
- [ ] Validate all addresses: `^0x[a-fA-F0-9]{40}$`
- [ ] Validate amounts: non-negative numeric strings `^[0-9]+$`
- [ ] Reject inputs containing shell metacharacters: `; | & $ \` ( ) > < \ ' "`
- [ ] Always require user confirmation before executing transactions
- [ ] Set reasonable slippage tolerance (not too loose)
- [ ] Monitor for Permit2 allowance expiration

---

*Report compiled from Uniswap documentation, GitHub repositories, and community resources. All URLs verified as of March 2026.*
