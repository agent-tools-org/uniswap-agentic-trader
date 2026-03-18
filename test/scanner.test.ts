import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PriceSnapshot } from "../src/strategy/scanner";
import { TOKENS } from "../src/config";

// Mock the API module so no real HTTP calls are made
vi.mock("../src/uniswap/api", () => ({
  getIndicativeQuote: vi.fn(),
}));

import { detectOpportunities, scanPrices } from "../src/strategy/scanner";
import { getIndicativeQuote } from "../src/uniswap/api";

const mockedGetIndicativeQuote = vi.mocked(getIndicativeQuote);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// detectOpportunities — pure logic, no mocking needed
// ---------------------------------------------------------------------------

describe("detectOpportunities", () => {
  const now = Date.now();

  it("returns empty array when all stablecoin prices are at parity", () => {
    const snapshots: PriceSnapshot[] = [
      {
        tokenIn: TOKENS.USDC,
        tokenOut: TOKENS.USDT,
        amountIn: "1000000",
        amountOut: "1000000",
        price: 1.0,
        timestamp: now,
      },
      {
        tokenIn: TOKENS.USDT,
        tokenOut: TOKENS.USDC,
        amountIn: "1000000",
        amountOut: "1000000",
        price: 1.0,
        timestamp: now,
      },
    ];
    const opps = detectOpportunities(snapshots);
    expect(opps).toHaveLength(0);
  });

  it("detects stablecoin deviation above 10 bps", () => {
    const snapshots: PriceSnapshot[] = [
      {
        tokenIn: TOKENS.USDC,
        tokenOut: TOKENS.USDT,
        amountIn: "1000000", // 1 USDC
        amountOut: "1005000", // 1.005 USDT — 50 bps off parity
        price: 1.005,
        timestamp: now,
      },
    ];
    const opps = detectOpportunities(snapshots);
    expect(opps.length).toBeGreaterThanOrEqual(1);
    expect(opps[0].tokenIn.symbol).toBe("USDC");
    expect(opps[0].tokenOut.symbol).toBe("USDT");
    expect(opps[0].deviationBps).toBeCloseTo(50, 0);
    expect(opps[0].reason).toContain("deviates");
  });

  it("ignores stablecoin deviation at or below 10 bps", () => {
    const snapshots: PriceSnapshot[] = [
      {
        tokenIn: TOKENS.USDC,
        tokenOut: TOKENS.DAI,
        amountIn: "1000000",
        amountOut: "1000100000000000000", // price ≈ 1.0001 → 1 bps
        price: 1.0001,
        timestamp: now,
      },
    ];
    const opps = detectOpportunities(snapshots);
    expect(opps).toHaveLength(0);
  });

  it("detects WETH pricing cross-check deviation", () => {
    // USDC buys more WETH per dollar than USDT — >15 bps spread
    const snapshots: PriceSnapshot[] = [
      {
        tokenIn: TOKENS.USDC,
        tokenOut: TOKENS.WETH,
        amountIn: "1000000",
        amountOut: "400000000000000", // 0.0004 WETH
        price: 0.0004,
        timestamp: now,
      },
      {
        tokenIn: TOKENS.USDT,
        tokenOut: TOKENS.WETH,
        amountIn: "1000000",
        amountOut: "399000000000000", // 0.000399 WETH — ~25 bps cheaper
        price: 0.000399,
        timestamp: now,
      },
    ];
    const opps = detectOpportunities(snapshots);
    expect(opps.length).toBeGreaterThanOrEqual(1);
    expect(opps[0].reason).toContain("WETH cheaper via");
  });

  it("does not flag WETH cross-check when deviation is ≤15 bps", () => {
    const snapshots: PriceSnapshot[] = [
      {
        tokenIn: TOKENS.USDC,
        tokenOut: TOKENS.WETH,
        amountIn: "1000000",
        amountOut: "400000000000000",
        price: 0.0004,
        timestamp: now,
      },
      {
        tokenIn: TOKENS.USDT,
        tokenOut: TOKENS.WETH,
        amountIn: "1000000",
        amountOut: "399950000000000", // ~1.25 bps off
        price: 0.00039995,
        timestamp: now,
      },
    ];
    const opps = detectOpportunities(snapshots);
    // Only WETH cross-check opps — should be none at ≤15 bps
    const wethOpps = opps.filter((o) => o.reason.includes("WETH cheaper"));
    expect(wethOpps).toHaveLength(0);
  });

  it("sorts opportunities by score descending", () => {
    const snapshots: PriceSnapshot[] = [
      {
        tokenIn: TOKENS.USDC,
        tokenOut: TOKENS.USDT,
        amountIn: "1000000",
        amountOut: "1002000", // 20 bps
        price: 1.002,
        timestamp: now,
      },
      {
        tokenIn: TOKENS.USDC,
        tokenOut: TOKENS.DAI,
        amountIn: "1000000",
        amountOut: "1010000000000000000", // 100 bps
        price: 1.01,
        timestamp: now,
      },
    ];
    const opps = detectOpportunities(snapshots);
    expect(opps.length).toBe(2);
    expect(opps[0].score).toBeGreaterThanOrEqual(opps[1].score);
  });
});

// ---------------------------------------------------------------------------
// scanPrices — mocked API
// ---------------------------------------------------------------------------

describe("scanPrices", () => {
  it("calls getIndicativeQuote for each pair and returns snapshots", async () => {
    // The scanner creates pairs for WETH↔stables and stable↔stable
    // Return a valid response for every call
    mockedGetIndicativeQuote.mockResolvedValue({
      input: {
        token: "0x0000000000000000000000000000000000000001",
        amount: "1000000",
        chainId: 8453,
      },
      output: {
        token: "0x0000000000000000000000000000000000000002",
        amount: "1000000",
        chainId: 8453,
      },
    });

    const snapshots = await scanPrices();
    // Scanner builds: 3 WETH→stable + 3 stable→WETH + 3 stable↔stable pairs = 12
    expect(snapshots.length).toBeGreaterThan(0);
    expect(mockedGetIndicativeQuote).toHaveBeenCalled();
  });

  it("handles rejected indicative quotes gracefully", async () => {
    let callCount = 0;
    mockedGetIndicativeQuote.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("rate limited");
      }
      return {
        input: {
          token: "0x0000000000000000000000000000000000000001",
          amount: "1000000",
          chainId: 8453,
        },
        output: {
          token: "0x0000000000000000000000000000000000000002",
          amount: "1000000",
          chainId: 8453,
        },
      };
    });

    // Should not throw — failed quotes are filtered via Promise.allSettled
    const snapshots = await scanPrices();
    // At least some snapshots returned despite one failure
    expect(snapshots.length).toBeGreaterThan(0);
    // One less than total calls
    expect(snapshots.length).toBe(mockedGetIndicativeQuote.mock.calls.length - 1);
  });
});
