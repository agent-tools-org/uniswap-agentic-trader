import { describe, it, expect } from "vitest";
import {
  CHAIN_ID,
  CHAIN,
  UNISWAP_API_BASE,
  PERMIT2_ADDRESS,
  TOKENS,
  TOKEN_LIST,
  getAllPairs,
} from "../src/config";

describe("config", () => {
  it("exports Base chain ID 8453", () => {
    expect(CHAIN_ID).toBe(8453);
  });

  it("exports CHAIN with matching id", () => {
    expect(CHAIN.id).toBe(8453);
    expect(CHAIN.name).toBe("Base");
  });

  it("exports the correct Uniswap API base URL", () => {
    expect(UNISWAP_API_BASE).toBe(
      "https://trade-api.gateway.uniswap.org/v1",
    );
  });

  it("exports the canonical Permit2 address", () => {
    expect(PERMIT2_ADDRESS).toBe(
      "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    );
  });

  describe("TOKENS", () => {
    it("contains WETH with correct address and decimals", () => {
      expect(TOKENS.WETH).toBeDefined();
      expect(TOKENS.WETH.symbol).toBe("WETH");
      expect(TOKENS.WETH.address).toBe(
        "0x4200000000000000000000000000000000000006",
      );
      expect(TOKENS.WETH.decimals).toBe(18);
    });

    it("contains USDC with correct address and decimals", () => {
      expect(TOKENS.USDC).toBeDefined();
      expect(TOKENS.USDC.symbol).toBe("USDC");
      expect(TOKENS.USDC.address).toBe(
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      );
      expect(TOKENS.USDC.decimals).toBe(6);
    });

    it("contains USDT with 6 decimals", () => {
      expect(TOKENS.USDT).toBeDefined();
      expect(TOKENS.USDT.decimals).toBe(6);
    });

    it("contains DAI with 18 decimals", () => {
      expect(TOKENS.DAI).toBeDefined();
      expect(TOKENS.DAI.decimals).toBe(18);
    });
  });

  describe("TOKEN_LIST", () => {
    it("has 4 tokens", () => {
      expect(TOKEN_LIST).toHaveLength(4);
    });

    it("lists WETH, USDC, USDT, DAI in order", () => {
      expect(TOKEN_LIST.map((t) => t.symbol)).toEqual([
        "WETH",
        "USDC",
        "USDT",
        "DAI",
      ]);
    });
  });

  describe("getAllPairs", () => {
    it("returns n*(n-1) directed pairs for 4 tokens", () => {
      const pairs = getAllPairs();
      // 4 tokens → 4*3 = 12 directed pairs
      expect(pairs).toHaveLength(12);
    });

    it("never pairs a token with itself", () => {
      const pairs = getAllPairs();
      for (const [a, b] of pairs) {
        expect(a.symbol).not.toBe(b.symbol);
      }
    });
  });
});
