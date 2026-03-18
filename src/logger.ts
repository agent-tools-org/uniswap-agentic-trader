import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Trade journal — append-only JSONL logger
// ---------------------------------------------------------------------------

const LOG_DIR = path.resolve(__dirname, "..", "logs");
const LOG_PATH = path.join(LOG_DIR, "trades.jsonl");

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

export interface TradeLogEntry {
  timestamp: string;
  pair: string;
  direction: "BUY" | "SELL" | "SWAP";
  amountIn: string;
  tokenIn: string;
  tokenOut: string;
  routing: string;
  quoteOutput?: string;
  txHash?: string;
  orderId?: string;
  status: "QUOTED" | "SUBMITTED" | "CONFIRMED" | "FAILED";
  reason: string;
  error?: string;
  [key: string]: unknown;
}

/**
 * Append a trade log entry to logs/trades.jsonl.
 */
export function logTrade(entry: TradeLogEntry): void {
  ensureLogDir();
  const line = JSON.stringify(entry) + "\n";
  fs.appendFileSync(LOG_PATH, line, "utf-8");
  console.log(`[journal] Logged trade: ${entry.pair} ${entry.status}`);
}

/**
 * Read all trade log entries.
 */
export function readTradeLog(): TradeLogEntry[] {
  if (!fs.existsSync(LOG_PATH)) return [];
  const lines = fs.readFileSync(LOG_PATH, "utf-8").trim().split("\n");
  return lines
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as TradeLogEntry);
}
