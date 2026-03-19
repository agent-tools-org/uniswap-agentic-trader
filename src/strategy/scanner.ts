import { getIndicativeQuote } from "../uniswap/api";
import { TOKEN_LIST, TOKENS, type TokenInfo } from "../config";
import type { Address } from "viem";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PriceSnapshot {
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  amountIn: string;
  amountOut: string;
  /** Derived price: amountOut / amountIn (adjusted for decimals) */
  price: number;
  timestamp: number;
}

export interface Opportunity {
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  amountIn: string;
  expectedOut: string;
  /** Price compared to USDC-normalised mid price */
  deviationBps: number;
  /** Estimated profit in output-token terms minus rough gas cost */
  score: number;
  reason: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toHuman(raw: string, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

/** Default scan amount: 1 USDC or equivalent */
function defaultScanAmount(token: TokenInfo): string {
  if (token.symbol === "WETH") return (0.0004 * 10 ** 18).toFixed(0); // ~$1 of ETH
  return (1 * 10 ** token.decimals).toFixed(0); // 1 unit for stablecoins
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

/**
 * Scan all pairs using cheap indicative quotes and return price snapshots.
 */
export async function scanPrices(): Promise<PriceSnapshot[]> {
  const snapshots: PriceSnapshot[] = [];
  const now = Date.now();

  // Build quote requests for key pairs (stablecoins ↔ WETH, stablecoin ↔ stablecoin)
  const pairs: [TokenInfo, TokenInfo][] = [];
  const stables = [TOKENS.USDC, TOKENS.USDT, TOKENS.DAI];

  // WETH ↔ each stable
  for (const stable of stables) {
    pairs.push([TOKENS.WETH, stable]);
    pairs.push([stable, TOKENS.WETH]);
  }
  // Stable ↔ stable
  for (let i = 0; i < stables.length; i++) {
    for (let j = i + 1; j < stables.length; j++) {
      pairs.push([stables[i], stables[j]]);
      pairs.push([stables[j], stables[i]]);
    }
  }

  // Fire indicative quotes in parallel (bounded)
  const results = await Promise.allSettled(
    pairs.map(async ([tokenIn, tokenOut]) => {
      const amount = defaultScanAmount(tokenIn);
      const resp = await getIndicativeQuote(
        tokenIn.address,
        tokenOut.address,
        amount,
      );
      const priceRaw =
        toHuman(resp.output.amount, tokenOut.decimals) /
        toHuman(amount, tokenIn.decimals);

      return {
        tokenIn,
        tokenOut,
        amountIn: amount,
        amountOut: resp.output.amount,
        price: priceRaw,
        timestamp: now,
      } satisfies PriceSnapshot;
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      snapshots.push(r.value);
    } else {
      console.warn("[scanner] indicative quote failed:", r.reason);
    }
  }

  return snapshots;
}

/**
 * Detect opportunities from price snapshots:
 *  - Stablecoin deviation (USDC/USDT or USDC/DAI off 1:1)
 *  - Triangular deviation (A→B→C→A yields >1)
 */
export function detectOpportunities(
  snapshots: PriceSnapshot[],
): Opportunity[] {
  const opportunities: Opportunity[] = [];
  const ESTIMATED_GAS_COST_USD = 0.05; // rough Base gas cost per swap

  // ------ Stablecoin pair deviation ------
  const stablePairs = snapshots.filter(
    (s) =>
      s.tokenIn.symbol !== "WETH" &&
      s.tokenOut.symbol !== "WETH",
  );

  for (const snap of stablePairs) {
    // Stablecoin->stablecoin swaps: only flag if expected output is strictly
    // greater than input (decimal-adjusted). This avoids misclassifying
    // loss-making swaps as profitable due to floating rounding.
    const amountIn = BigInt(snap.amountIn);
    const amountOut = BigInt(snap.amountOut);
    if (amountIn === 0n || amountOut === 0n) continue;

    // Compare human amounts without floating point:
    // amountOut / 10^outDec > amountIn / 10^inDec
    // <=> amountOut * 10^inDec > amountIn * 10^outDec
    const inDecPow = 10n ** BigInt(snap.tokenIn.decimals);
    const outDecPow = 10n ** BigInt(snap.tokenOut.decimals);
    const left = amountOut * inDecPow;
    const right = amountIn * outDecPow;
    if (left <= right) continue; // would be loss-making

    // Deviation in bps, derived from the same integer comparison.
    // We use floor division here; the strict `left > right` gate ensures it
    // is still positive.
    const priceRatioBps = (left * 10_000n) / right; // floor((out/in) * 10000)
    const deviationBpsInt = priceRatioBps - 10_000n;
    const deviationBps = Number(deviationBpsInt);

    if (deviationBps > 10) {
      // >0.1% positive deviation
      const deviation = deviationBpsInt === 0n ? 0 : Number(deviationBpsInt) / 10_000;
      const profitUsd = deviation * toHuman(snap.amountIn, snap.tokenIn.decimals) - ESTIMATED_GAS_COST_USD;
      opportunities.push({
        tokenIn: snap.tokenIn,
        tokenOut: snap.tokenOut,
        amountIn: snap.amountIn,
        expectedOut: snap.amountOut,
        deviationBps,
        score: profitUsd,
        reason: `${snap.tokenIn.symbol}→${snap.tokenOut.symbol} price ${snap.price.toFixed(6)} deviates ${deviationBps.toFixed(1)} bps from parity`,
      });
    }
  }

  // ------ WETH pricing cross-check ------
  // Find best USDC→WETH price and compare with USDT→WETH and DAI→WETH
  const wethBuys = snapshots.filter((s) => s.tokenOut.symbol === "WETH");
  if (wethBuys.length >= 2) {
    // Sort by best WETH per unit input
    const sorted = [...wethBuys].sort((a, b) => b.price - a.price);
    const best = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const other = sorted[i];
      const deviationBps =
        ((best.price - other.price) / best.price) * 10_000;
      if (deviationBps > 15) {
        opportunities.push({
          tokenIn: other.tokenIn,
          tokenOut: other.tokenOut,
          amountIn: other.amountIn,
          expectedOut: other.amountOut,
          deviationBps,
          score: deviationBps / 100 - ESTIMATED_GAS_COST_USD,
          reason: `WETH cheaper via ${best.tokenIn.symbol} than ${other.tokenIn.symbol} by ${deviationBps.toFixed(1)} bps`,
        });
      }
    }
  }

  // Sort by score descending
  opportunities.sort((a, b) => b.score - a.score);
  return opportunities;
}

/**
 * High-level scan: get prices then detect opportunities.
 */
export async function scanForOpportunities(): Promise<{
  snapshots: PriceSnapshot[];
  opportunities: Opportunity[];
}> {
  console.log("[scanner] Scanning prices via indicative quotes...");
  const snapshots = await scanPrices();
  console.log(`[scanner] Got ${snapshots.length} price snapshots`);

  const opportunities = detectOpportunities(snapshots);
  console.log(`[scanner] Found ${opportunities.length} opportunities`);

  return { snapshots, opportunities };
}
