import { type Address, type Chain } from "viem";
import { base } from "viem/chains";
import * as dotenv from "dotenv";

dotenv.config();

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val;
}

export const UNISWAP_API_KEY = requireEnv("UNISWAP_API_KEY");
export const WALLET_PRIVATE_KEY = requireEnv("WALLET_PRIVATE_KEY") as `0x${string}`;
export const RPC_URL = process.env.RPC_URL ?? "https://mainnet.base.org";

// ---------------------------------------------------------------------------
// Chain
// ---------------------------------------------------------------------------

export const CHAIN: Chain = base;
export const CHAIN_ID = 8453;

// ---------------------------------------------------------------------------
// Trading API
// ---------------------------------------------------------------------------

export const UNISWAP_API_BASE = "https://trade-api.gateway.uniswap.org/v1";

// ---------------------------------------------------------------------------
// Permit2 (same address on all chains)
// ---------------------------------------------------------------------------

export const PERMIT2_ADDRESS: Address =
  "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// ---------------------------------------------------------------------------
// Token addresses on Base
// ---------------------------------------------------------------------------

export interface TokenInfo {
  symbol: string;
  address: Address;
  decimals: number;
}

export const TOKENS: Record<string, TokenInfo> = {
  WETH: {
    symbol: "WETH",
    address: "0x4200000000000000000000000000000000000006",
    decimals: 18,
  },
  USDC: {
    symbol: "USDC",
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    decimals: 6,
  },
  USDT: {
    symbol: "USDT",
    address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    decimals: 6,
  },
  DAI: {
    symbol: "DAI",
    address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
    decimals: 18,
  },
};

// Ordered list of tokens for scanning
export const TOKEN_LIST: TokenInfo[] = [
  TOKENS.WETH,
  TOKENS.USDC,
  TOKENS.USDT,
  TOKENS.DAI,
];

// All trading pairs (each direction)
export function getAllPairs(): [TokenInfo, TokenInfo][] {
  const pairs: [TokenInfo, TokenInfo][] = [];
  for (let i = 0; i < TOKEN_LIST.length; i++) {
    for (let j = 0; j < TOKEN_LIST.length; j++) {
      if (i !== j) pairs.push([TOKEN_LIST[i], TOKEN_LIST[j]]);
    }
  }
  return pairs;
}
