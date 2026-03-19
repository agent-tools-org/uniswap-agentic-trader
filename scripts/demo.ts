/**
 * Demo script — reads real Uniswap V3 pool data from Base mainnet.
 *
 * Connects to the WETH/USDC pool on Base via a public RPC and reads:
 *   - slot0()    → current tick & sqrtPriceX96
 *   - liquidity() → pool liquidity
 *   - fee()       → fee tier
 *
 * Converts the tick to a human-readable USDC-per-WETH price and persists
 * the results to proof/demo.json.
 *
 * Usage:  npx ts-node scripts/demo.ts
 */

import { createPublicClient, http, formatUnits } from "viem";
import { base } from "viem/chains";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RPC_URL = "https://mainnet.base.org";

/** WETH/USDC 0.05 % pool on Base */
const POOL_ADDRESS = "0xd0b53D9277642d899DF5C87A3966A349A798F224" as const;

/** Minimal Uniswap V3 pool ABI (read-only functions we need) */
const POOL_ABI = [
  {
    name: "slot0",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
  {
    name: "liquidity",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint128" }],
  },
  {
    name: "fee",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint24" }],
  },
] as const;

// ---------------------------------------------------------------------------
// Tick → human-readable price
// ---------------------------------------------------------------------------

/**
 * Convert a Uniswap V3 tick to a human-readable price.
 *
 * In this pool WETH is token0 (18 decimals) and USDC is token1 (6 decimals).
 * raw_price  = 1.0001 ^ tick          (token1-per-token0 in raw units)
 * human_price = raw_price × 10^(decimals0 − decimals1)
 */
function tickToPrice(tick: number): number {
  const rawPrice = Math.pow(1.0001, tick);
  // WETH decimals (18) − USDC decimals (6) = 12
  return rawPrice * Math.pow(10, 12);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("[demo] Uniswap V3 — WETH/USDC Pool on Base");
  console.log("=".repeat(60));

  const client = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  // --- Read pool state -------------------------------------------------

  console.log(`[demo] Pool: ${POOL_ADDRESS}`);
  console.log(`[demo] RPC : ${RPC_URL}`);
  console.log();

  const [slot0, liquidity, fee] = await Promise.all([
    client.readContract({
      address: POOL_ADDRESS,
      abi: POOL_ABI,
      functionName: "slot0",
    }),
    client.readContract({
      address: POOL_ADDRESS,
      abi: POOL_ABI,
      functionName: "liquidity",
    }),
    client.readContract({
      address: POOL_ADDRESS,
      abi: POOL_ABI,
      functionName: "fee",
    }),
  ]);

  const [sqrtPriceX96, tick] = slot0;
  const price = tickToPrice(Number(tick));

  console.log(`[demo] sqrtPriceX96 : ${sqrtPriceX96.toString()}`);
  console.log(`[demo] tick         : ${tick}`);
  console.log(`[demo] liquidity    : ${liquidity.toString()}`);
  console.log(`[demo] fee (bps)    : ${Number(fee) / 100}`);
  console.log(`[demo] WETH price   : $${price.toFixed(2)} USDC`);
  console.log();

  // --- Persist proof ----------------------------------------------------

  const proofDir = path.resolve(__dirname, "..", "proof");
  if (!fs.existsSync(proofDir)) {
    fs.mkdirSync(proofDir, { recursive: true });
  }

  const proof = {
    timestamp: new Date().toISOString(),
    pool: POOL_ADDRESS,
    chain: "Base",
    chainId: 8453,
    token0: "WETH",
    token1: "USDC",
    sqrtPriceX96: sqrtPriceX96.toString(),
    tick: Number(tick),
    price: `${price.toFixed(6)} USDC/WETH`,
    liquidity: liquidity.toString(),
    feeTier: Number(fee),
  };

  const proofPath = path.join(proofDir, "demo.json");
  fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2) + "\n");

  console.log(`[demo] ✅ Proof saved to ${proofPath}`);
  console.log(JSON.stringify(proof, null, 2));
}

main().catch((err) => {
  console.error("[demo] Fatal error:", err);
  process.exit(1);
});
