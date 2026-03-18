import {
  createWalletClient,
  createPublicClient,
  http,
  formatUnits,
  type Hex,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  WALLET_PRIVATE_KEY,
  RPC_URL,
  CHAIN,
  CHAIN_ID,
  TOKEN_LIST,
  type TokenInfo,
} from "../config";
import {
  checkApproval,
  getQuote,
  executeSwap,
  submitOrder,
} from "../uniswap/api";
import { signPermit2 } from "../uniswap/permit2";
import {
  scanForOpportunities,
  type Opportunity,
} from "../strategy/scanner";
import { logTrade, type TradeLogEntry } from "../logger";
import type { QuoteResponse } from "../uniswap/types";

// ---------------------------------------------------------------------------
// Wallet setup
// ---------------------------------------------------------------------------

const account = privateKeyToAccount(WALLET_PRIVATE_KEY);

function getWalletClient(): WalletClient {
  return createWalletClient({
    account,
    chain: CHAIN,
    transport: http(RPC_URL),
  });
}

function getPublicClient(): PublicClient {
  return createPublicClient({
    chain: CHAIN,
    transport: http(RPC_URL),
  });
}

// ---------------------------------------------------------------------------
// AI reasoning stub
// ---------------------------------------------------------------------------

/**
 * Simple rule-based "AI reasoning" that selects the best opportunity
 * and provides an explanation.  In production this would call an LLM
 * but for the hackathon demo we use deterministic logic.
 */
function reasonAboutTrade(
  opportunities: Opportunity[],
): { selected: Opportunity; explanation: string } | null {
  if (opportunities.length === 0) {
    return null;
  }

  // Pick the highest-scored opportunity
  const selected = opportunities[0];

  const explanation = [
    `[AI Reasoning] Evaluated ${opportunities.length} opportunity(ies).`,
    `Selected: ${selected.tokenIn.symbol} → ${selected.tokenOut.symbol}`,
    `Deviation: ${selected.deviationBps.toFixed(1)} bps`,
    `Score: ${selected.score.toFixed(4)}`,
    `Rationale: ${selected.reason}`,
    selected.score > 0
      ? "Decision: EXECUTE — expected profit exceeds estimated gas cost."
      : "Decision: SKIP — costs exceed expected profit.",
  ].join("\n  ");

  return { selected, explanation };
}

// ---------------------------------------------------------------------------
// Core trading loop
// ---------------------------------------------------------------------------

export async function runTradingCycle(): Promise<void> {
  const walletClient = getWalletClient();
  const publicClient = getPublicClient();

  console.log("=".repeat(60));
  console.log("[trader] Starting trading cycle");
  console.log(`[trader] Wallet: ${account.address}`);
  console.log(`[trader] Chain: Base (${CHAIN_ID})`);
  console.log("=".repeat(60));

  // ---- Step 1: Scan prices via indicative quotes ----
  const { snapshots, opportunities } = await scanForOpportunities();

  if (snapshots.length > 0) {
    console.log("\n[trader] Price snapshots:");
    for (const s of snapshots) {
      console.log(
        `  ${s.tokenIn.symbol} → ${s.tokenOut.symbol}: ${s.price.toFixed(6)}`,
      );
    }
  }

  // ---- Step 2: AI reasoning — pick best opportunity ----
  const decision = reasonAboutTrade(opportunities);

  if (!decision) {
    console.log("\n[trader] No profitable opportunities found. Sleeping...");
    return;
  }

  console.log("\n" + decision.explanation);

  if (decision.selected.score <= 0) {
    console.log("[trader] Skipping — insufficient expected profit.");
    logTrade({
      timestamp: new Date().toISOString(),
      pair: `${decision.selected.tokenIn.symbol}/${decision.selected.tokenOut.symbol}`,
      direction: "SWAP",
      amountIn: decision.selected.amountIn,
      tokenIn: decision.selected.tokenIn.symbol,
      tokenOut: decision.selected.tokenOut.symbol,
      routing: "N/A",
      status: "QUOTED",
      reason: decision.explanation,
    });
    return;
  }

  const opp = decision.selected;

  // ---- Step 3: Get executable quote ----
  console.log(
    `\n[trader] Getting executable quote: ${opp.tokenIn.symbol} → ${opp.tokenOut.symbol}`,
  );

  let quote: QuoteResponse;
  try {
    quote = await getQuote(
      opp.tokenIn.address,
      opp.tokenOut.address,
      opp.amountIn,
      account.address,
      { slippageTolerance: 0.5, routingPreference: "BEST_PRICE" },
    );
    console.log(`[trader] Quote routing: ${quote.routing}`);
    console.log(
      `[trader] Quote output: ${formatUnits(BigInt(quote.quote.output.amount), opp.tokenOut.decimals)} ${opp.tokenOut.symbol}`,
    );
  } catch (err) {
    console.error("[trader] Quote failed:", err);
    logTrade({
      timestamp: new Date().toISOString(),
      pair: `${opp.tokenIn.symbol}/${opp.tokenOut.symbol}`,
      direction: "SWAP",
      amountIn: opp.amountIn,
      tokenIn: opp.tokenIn.symbol,
      tokenOut: opp.tokenOut.symbol,
      routing: "UNKNOWN",
      status: "FAILED",
      reason: decision.explanation,
      error: String(err),
    });
    return;
  }

  // ---- Step 4: Check approval (handle Permit2) ----
  console.log("[trader] Checking token approval...");
  try {
    const approvalResp = await checkApproval(
      opp.tokenIn.address,
      opp.amountIn,
      account.address,
      CHAIN_ID,
    );

    if (approvalResp.approval) {
      console.log("[trader] Approval needed — sending approval tx...");
      const txHash = await walletClient.sendTransaction({
        to: approvalResp.approval.to,
        data: approvalResp.approval.data,
        value: BigInt(approvalResp.approval.value || "0"),
        chain: CHAIN,
        account,
      });
      console.log(`[trader] Approval tx: ${txHash}`);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });
      console.log(`[trader] Approval confirmed in block ${receipt.blockNumber}`);
    } else {
      console.log("[trader] Token already approved.");
    }
  } catch (err) {
    console.error("[trader] Approval check/tx failed:", err);
    logTrade({
      timestamp: new Date().toISOString(),
      pair: `${opp.tokenIn.symbol}/${opp.tokenOut.symbol}`,
      direction: "SWAP",
      amountIn: opp.amountIn,
      tokenIn: opp.tokenIn.symbol,
      tokenOut: opp.tokenOut.symbol,
      routing: quote.routing,
      quoteOutput: quote.quote.output.amount,
      status: "FAILED",
      reason: decision.explanation,
      error: `Approval failed: ${err}`,
    });
    return;
  }

  // ---- Step 5: Sign Permit2 if needed ----
  let signature: Hex | undefined;
  if (quote.permitData) {
    console.log("[trader] Signing Permit2 data...");
    try {
      signature = await signPermit2(walletClient, account, quote.permitData);
      console.log("[trader] Permit2 signature obtained.");
    } catch (err) {
      console.error("[trader] Permit2 signing failed:", err);
      logTrade({
        timestamp: new Date().toISOString(),
        pair: `${opp.tokenIn.symbol}/${opp.tokenOut.symbol}`,
        direction: "SWAP",
        amountIn: opp.amountIn,
        tokenIn: opp.tokenIn.symbol,
        tokenOut: opp.tokenOut.symbol,
        routing: quote.routing,
        quoteOutput: quote.quote.output.amount,
        status: "FAILED",
        reason: decision.explanation,
        error: `Permit2 signing failed: ${err}`,
      });
      return;
    }
  }

  // ---- Step 6: Execute swap or submit UniswapX order ----
  const isUniswapX = ["DUTCH_V2", "DUTCH_V3", "PRIORITY"].includes(
    quote.routing,
  );

  if (isUniswapX && signature) {
    // ---- UniswapX gasless order ----
    console.log("[trader] Submitting UniswapX gasless order...");
    try {
      const orderResp = await submitOrder(quote, signature);
      console.log(`[trader] ✅ Order submitted! ID: ${orderResp.orderId}`);

      logTrade({
        timestamp: new Date().toISOString(),
        pair: `${opp.tokenIn.symbol}/${opp.tokenOut.symbol}`,
        direction: "SWAP",
        amountIn: opp.amountIn,
        tokenIn: opp.tokenIn.symbol,
        tokenOut: opp.tokenOut.symbol,
        routing: quote.routing,
        quoteOutput: quote.quote.output.amount,
        orderId: orderResp.orderId,
        status: "SUBMITTED",
        reason: decision.explanation,
      });
    } catch (err) {
      console.error("[trader] UniswapX order submission failed:", err);
      logTrade({
        timestamp: new Date().toISOString(),
        pair: `${opp.tokenIn.symbol}/${opp.tokenOut.symbol}`,
        direction: "SWAP",
        amountIn: opp.amountIn,
        tokenIn: opp.tokenIn.symbol,
        tokenOut: opp.tokenOut.symbol,
        routing: quote.routing,
        quoteOutput: quote.quote.output.amount,
        status: "FAILED",
        reason: decision.explanation,
        error: String(err),
      });
    }
  } else {
    // ---- Classic swap ----
    console.log("[trader] Executing classic swap...");
    try {
      const swapResp = await executeSwap(quote, signature);
      const swap = swapResp.swap;

      console.log("[trader] Broadcasting swap transaction...");
      const txHash = await walletClient.sendTransaction({
        to: swap.to,
        data: swap.data,
        value: BigInt(swap.value || "0"),
        chain: CHAIN,
        account,
        ...(swap.gasLimit ? { gas: BigInt(swap.gasLimit) } : {}),
      });

      console.log(`[trader] ✅ Swap tx submitted: ${txHash}`);

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });
      console.log(
        `[trader] Swap confirmed in block ${receipt.blockNumber} | status: ${receipt.status}`,
      );

      logTrade({
        timestamp: new Date().toISOString(),
        pair: `${opp.tokenIn.symbol}/${opp.tokenOut.symbol}`,
        direction: "SWAP",
        amountIn: opp.amountIn,
        tokenIn: opp.tokenIn.symbol,
        tokenOut: opp.tokenOut.symbol,
        routing: quote.routing,
        quoteOutput: quote.quote.output.amount,
        txHash,
        status: receipt.status === "success" ? "CONFIRMED" : "FAILED",
        reason: decision.explanation,
        blockNumber: Number(receipt.blockNumber),
        gasUsed: receipt.gasUsed.toString(),
      });
    } catch (err) {
      console.error("[trader] Swap execution failed:", err);
      logTrade({
        timestamp: new Date().toISOString(),
        pair: `${opp.tokenIn.symbol}/${opp.tokenOut.symbol}`,
        direction: "SWAP",
        amountIn: opp.amountIn,
        tokenIn: opp.tokenIn.symbol,
        tokenOut: opp.tokenOut.symbol,
        routing: quote.routing,
        quoteOutput: quote.quote.output.amount,
        status: "FAILED",
        reason: decision.explanation,
        error: String(err),
      });
    }
  }

  console.log("\n[trader] Trading cycle complete.");
}

/**
 * Run the agent in a continuous loop with a configurable interval.
 */
export async function startAgent(intervalMs: number = 60_000): Promise<void> {
  console.log(
    `[agent] Starting Uniswap Agentic Trader (interval: ${intervalMs / 1000}s)`,
  );
  console.log(`[agent] Wallet: ${account.address}`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await runTradingCycle();
    } catch (err) {
      console.error("[agent] Unhandled error in trading cycle:", err);
    }
    console.log(
      `\n[agent] Sleeping ${intervalMs / 1000}s until next cycle...\n`,
    );
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
