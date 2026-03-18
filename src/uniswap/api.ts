import { UNISWAP_API_BASE, UNISWAP_API_KEY, CHAIN_ID } from "../config";
import type {
  CheckApprovalRequest,
  CheckApprovalResponse,
  QuoteRequest,
  QuoteResponse,
  IndicativeQuoteRequest,
  IndicativeQuoteResponse,
  SwapResponse,
  OrderResponse,
  SwapStatusResponse,
  OrderStatusResponse,
  PermitData,
} from "./types";
import type { Address, Hex } from "viem";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

class UniswapApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly endpoint: string,
  ) {
    super(`Uniswap API error ${status} on ${endpoint}: ${body}`);
    this.name = "UniswapApiError";
  }
}

async function apiRequest<T>(
  endpoint: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<T> {
  const url = `${UNISWAP_API_BASE}${endpoint}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          "x-api-key": UNISWAP_API_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-universal-router-version": "2.0",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      if (res.status === 429) {
        // Rate limited — wait and retry
        const retryAfter = res.headers.get("retry-after");
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : RETRY_DELAY_MS * (attempt + 1);
        console.warn(
          `[api] Rate limited on ${endpoint}, retrying in ${waitMs}ms...`,
        );
        await sleep(waitMs);
        continue;
      }

      const text = await res.text();
      if (!res.ok) {
        throw new UniswapApiError(res.status, text, endpoint);
      }

      return JSON.parse(text) as T;
    } catch (err) {
      lastError = err as Error;
      if (err instanceof UniswapApiError && err.status !== 429) {
        throw err; // non-retryable
      }
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error(`Failed after ${MAX_RETRIES} retries`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether the wallet has sufficient token approval for the swap.
 * Returns approval tx calldata if an approval is needed, otherwise null.
 */
export async function checkApproval(
  token: Address,
  amount: string,
  walletAddress: Address,
  chainId: number = CHAIN_ID,
): Promise<CheckApprovalResponse> {
  return apiRequest<CheckApprovalResponse>("/check_approval", "POST", {
    token,
    amount,
    walletAddress,
    chainId,
  });
}

/**
 * Get an executable quote for a swap.
 */
export async function getQuote(
  tokenIn: Address,
  tokenOut: Address,
  amount: string,
  swapper: Address,
  options?: Partial<
    Pick<
      QuoteRequest,
      "slippageTolerance" | "protocols" | "routingPreference" | "urgency"
    >
  >,
): Promise<QuoteResponse> {
  const req: QuoteRequest = {
    type: "EXACT_INPUT",
    tokenIn,
    tokenOut,
    amount,
    tokenInChainId: CHAIN_ID,
    tokenOutChainId: CHAIN_ID,
    swapper,
    slippageTolerance: options?.slippageTolerance ?? 0.5,
    ...(options?.protocols && { protocols: options.protocols }),
    ...(options?.routingPreference && {
      routingPreference: options.routingPreference,
    }),
    ...(options?.urgency !== undefined && { urgency: options.urgency }),
  };
  return apiRequest<QuoteResponse>("/quote", "POST", req);
}

/**
 * Cheap indicative quote for price scanning — no Permit2 data returned.
 */
export async function getIndicativeQuote(
  tokenIn: Address,
  tokenOut: Address,
  amount: string,
): Promise<IndicativeQuoteResponse> {
  const req: IndicativeQuoteRequest = {
    type: "EXACT_INPUT",
    tokenIn,
    tokenOut,
    amount,
    tokenInChainId: CHAIN_ID,
    tokenOutChainId: CHAIN_ID,
  };
  return apiRequest<IndicativeQuoteResponse>("/indicative_quote", "POST", req);
}

/**
 * Convert an executable quote into unsigned transaction calldata (classic routing).
 */
export async function executeSwap(
  quote: QuoteResponse,
  signature?: Hex,
): Promise<SwapResponse> {
  const payload: Record<string, unknown> = {
    ...quote.quote,
    routing: quote.routing,
  };
  if (signature && quote.permitData) {
    payload.signature = signature;
    payload.permitData = quote.permitData;
  }
  if (signature && !quote.permitData) {
    payload.signature = signature;
  }
  payload.simulateTransaction = true;
  return apiRequest<SwapResponse>("/swap", "POST", payload);
}

/**
 * Submit a UniswapX gasless order (DUTCH_V2, DUTCH_V3, PRIORITY routing).
 */
export async function submitOrder(
  quote: QuoteResponse,
  signature: Hex,
): Promise<OrderResponse> {
  const payload: Record<string, unknown> = {
    ...quote.quote,
    routing: quote.routing,
    signature,
  };
  return apiRequest<OrderResponse>("/order", "POST", payload);
}

/**
 * Check the status of a submitted swap transaction.
 */
export async function getSwapStatus(
  txHash: Hex,
): Promise<SwapStatusResponse> {
  return apiRequest<SwapStatusResponse>(
    `/swaps?txHash=${txHash}`,
    "GET",
  );
}

/**
 * Check the status of a UniswapX order.
 */
export async function getOrderStatus(
  orderId: string,
): Promise<OrderStatusResponse> {
  return apiRequest<OrderStatusResponse>(
    `/orders?orderId=${orderId}`,
    "GET",
  );
}
