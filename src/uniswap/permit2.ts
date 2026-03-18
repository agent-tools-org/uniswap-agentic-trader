import {
  type WalletClient,
  type Hex,
  type Address,
  type Account,
} from "viem";
import type { PermitData } from "./types";

// ---------------------------------------------------------------------------
// Permit2 signature helper
// ---------------------------------------------------------------------------

/**
 * Sign Permit2 typed data returned from the /quote endpoint.
 *
 * For CLASSIC routing the resulting signature + permitData are both sent
 * to /swap.  For UniswapX routing (DUTCH_V2/V3, PRIORITY) only the
 * signature is sent to /order.
 */
export async function signPermit2(
  walletClient: WalletClient,
  account: Account | Address,
  permitData: PermitData,
): Promise<Hex> {
  // The Uniswap API returns Permit2 data in EIP-712 format with:
  //   domain, types, primaryType, values
  // viem's signTypedData expects: domain, types, primaryType, message

  const { domain, types, primaryType, values } = permitData;

  // Remove EIP712Domain from types if present (viem adds it automatically)
  const cleanTypes = { ...types } as Record<string, unknown>;
  if ("EIP712Domain" in cleanTypes) {
    delete cleanTypes["EIP712Domain"];
  }

  const signature = await walletClient.signTypedData({
    account: account as Account,
    domain: domain as Record<string, unknown>,
    types: cleanTypes as Record<string, Array<{ name: string; type: string }>>,
    primaryType: primaryType as string,
    message: values as Record<string, unknown>,
  });

  return signature;
}
