import type { Address, Hex } from "viem";

// ---------------------------------------------------------------------------
// /check_approval
// ---------------------------------------------------------------------------

export interface CheckApprovalRequest {
  token: Address;
  amount: string;
  walletAddress: Address;
  chainId: number;
}

export interface CheckApprovalResponse {
  approval: {
    to: Address;
    data: Hex;
    value: string;
    chainId: number;
    gasLimit?: string;
    gasFee?: string;
  } | null;
}

// ---------------------------------------------------------------------------
// /quote
// ---------------------------------------------------------------------------

export interface QuoteRequest {
  type: "EXACT_INPUT" | "EXACT_OUTPUT";
  tokenIn: Address;
  tokenOut: Address;
  amount: string;
  tokenInChainId: number;
  tokenOutChainId: number;
  swapper: Address;
  slippageTolerance?: number;
  protocols?: string[];
  routingPreference?: "BEST_PRICE" | "FASTEST" | "CLASSIC";
  urgency?: number;
}

export interface PermitData {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  values: Record<string, unknown>;
}

export interface QuoteResponse {
  routing: "CLASSIC" | "DUTCH_V2" | "DUTCH_V3" | "PRIORITY" | "WRAP_UNWRAP";
  quote: {
    input: { token: Address; amount: string; chainId: number };
    output: { token: Address; amount: string; chainId: number };
    swapper: Address;
    chainId: number;
    slippage: { tolerance: number };
    gasFee?: string;
    gasFeeUSD?: string;
    routeString?: string;
    priceImpact?: number;
    quoteId?: string;
    portionAmount?: string;
    portionBips?: number;
    [key: string]: unknown;
  };
  permitData?: PermitData;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// /indicative_quote
// ---------------------------------------------------------------------------

export interface IndicativeQuoteRequest {
  type: "EXACT_INPUT";
  tokenIn: Address;
  tokenOut: Address;
  amount: string;
  tokenInChainId: number;
  tokenOutChainId: number;
}

export interface IndicativeQuoteResponse {
  input: { token: Address; amount: string; chainId: number };
  output: { token: Address; amount: string; chainId: number };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// /swap
// ---------------------------------------------------------------------------

export interface SwapRequest {
  quote: Record<string, unknown>;
  signature?: Hex;
  permitData?: PermitData;
  simulateTransaction?: boolean;
}

export interface SwapResponse {
  swap: {
    to: Address;
    data: Hex;
    value: string;
    chainId: number;
    gasLimit?: string;
  };
}

// ---------------------------------------------------------------------------
// /order
// ---------------------------------------------------------------------------

export interface OrderRequest {
  quote: Record<string, unknown>;
  signature: Hex;
  [key: string]: unknown;
}

export interface OrderResponse {
  orderId: string;
}

// ---------------------------------------------------------------------------
// /swaps (GET) — status
// ---------------------------------------------------------------------------

export interface SwapStatusResponse {
  swaps: Array<{
    txHash: Hex;
    status: string;
    [key: string]: unknown;
  }>;
}

// ---------------------------------------------------------------------------
// /orders (GET) — status
// ---------------------------------------------------------------------------

export interface OrderStatusResponse {
  orders: Array<{
    orderId: string;
    status: string;
    txHash?: Hex;
    [key: string]: unknown;
  }>;
}
