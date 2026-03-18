import { startAgent, runTradingCycle } from "./agent/trader";

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "once";

  switch (mode) {
    case "loop":
      // Continuous trading loop (default 60s interval)
      await startAgent(
        parseInt(process.env.INTERVAL_MS ?? "60000", 10),
      );
      break;

    case "once":
    default:
      // Single trading cycle
      await runTradingCycle();
      break;
  }
}

main().catch((err) => {
  console.error("[main] Fatal error:", err);
  process.exit(1);
});
