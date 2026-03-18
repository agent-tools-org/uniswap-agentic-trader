/**
 * Standalone price scanner — runs indicative quotes and prints results.
 * Usage: npx ts-node src/scan.ts
 */
import { scanForOpportunities } from "./strategy/scanner";

async function main(): Promise<void> {
  const { snapshots, opportunities } = await scanForOpportunities();

  console.log("\n=== Price Snapshots ===");
  for (const s of snapshots) {
    console.log(
      `  ${s.tokenIn.symbol.padEnd(5)} → ${s.tokenOut.symbol.padEnd(5)}: ${s.price.toFixed(8)}`,
    );
  }

  console.log("\n=== Opportunities ===");
  if (opportunities.length === 0) {
    console.log("  No significant opportunities detected.");
  } else {
    for (const o of opportunities) {
      console.log(
        `  ${o.tokenIn.symbol} → ${o.tokenOut.symbol} | deviation: ${o.deviationBps.toFixed(1)} bps | score: ${o.score.toFixed(4)} | ${o.reason}`,
      );
    }
  }
}

main().catch((err) => {
  console.error("[scan] Error:", err);
  process.exit(1);
});
