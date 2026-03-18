import { describe, it, expect } from "vitest";
import type {
  CheckApprovalRequest,
  CheckApprovalResponse,
  QuoteRequest,
  QuoteResponse,
  IndicativeQuoteRequest,
  IndicativeQuoteResponse,
  SwapRequest,
  SwapResponse,
  OrderRequest,
  OrderResponse,
  SwapStatusResponse,
  OrderStatusResponse,
  PermitData,
} from "../src/uniswap/types";

describe("uniswap/types", () => {
  it("IndicativeQuoteRequest is structurally valid", () => {
    const req: IndicativeQuoteRequest = {
      type: "EXACT_INPUT",
      tokenIn: "0x0000000000000000000000000000000000000001",
      tokenOut: "0x0000000000000000000000000000000000000002",
      amount: "1000000",
      tokenInChainId: 8453,
      tokenOutChainId: 8453,
    };
    expect(req.type).toBe("EXACT_INPUT");
    expect(req.tokenInChainId).toBe(8453);
  });

  it("IndicativeQuoteResponse is structurally valid", () => {
    const resp: IndicativeQuoteResponse = {
      input: {
        token: "0x0000000000000000000000000000000000000001",
        amount: "1000000",
        chainId: 8453,
      },
      output: {
        token: "0x0000000000000000000000000000000000000002",
        amount: "999000",
        chainId: 8453,
      },
    };
    expect(resp.input.amount).toBe("1000000");
    expect(resp.output.amount).toBe("999000");
  });

  it("QuoteRequest supports all routing preferences", () => {
    const req: QuoteRequest = {
      type: "EXACT_INPUT",
      tokenIn: "0x0000000000000000000000000000000000000001",
      tokenOut: "0x0000000000000000000000000000000000000002",
      amount: "1000000",
      tokenInChainId: 8453,
      tokenOutChainId: 8453,
      swapper: "0x0000000000000000000000000000000000000099",
      routingPreference: "BEST_PRICE",
    };
    expect(req.routingPreference).toBe("BEST_PRICE");
  });

  it("QuoteResponse accepts all routing types", () => {
    const routings: QuoteResponse["routing"][] = [
      "CLASSIC",
      "DUTCH_V2",
      "DUTCH_V3",
      "PRIORITY",
      "WRAP_UNWRAP",
    ];
    expect(routings).toHaveLength(5);
  });

  it("CheckApprovalResponse can have null approval", () => {
    const resp: CheckApprovalResponse = { approval: null };
    expect(resp.approval).toBeNull();
  });

  it("SwapResponse contains swap calldata fields", () => {
    const resp: SwapResponse = {
      swap: {
        to: "0x0000000000000000000000000000000000000001",
        data: "0xabcdef",
        value: "0",
        chainId: 8453,
      },
    };
    expect(resp.swap.chainId).toBe(8453);
  });

  it("OrderResponse has orderId", () => {
    const resp: OrderResponse = { orderId: "abc-123" };
    expect(resp.orderId).toBe("abc-123");
  });

  it("PermitData has EIP-712 structure", () => {
    const pd: PermitData = {
      domain: { name: "Permit2", chainId: 8453 },
      types: { Permit: [{ name: "owner", type: "address" }] },
      primaryType: "Permit",
      values: { owner: "0x00" },
    };
    expect(pd.primaryType).toBe("Permit");
  });
});
