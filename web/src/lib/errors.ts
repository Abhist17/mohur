import { BaseError, ContractFunctionRevertedError, decodeErrorResult, parseAbi, type Abi, type Hex } from "viem";
import {
  AquaAbi,
  UnisonHookAbi,
  UnisonHookFactoryAbi,
  UnisonLensAbi,
  UnisonLoopRouterAbi,
  UnisonSwapVMRouterAbi,
  UnisonTestTokenAbi,
} from "@/generated/abis";

/** Every custom error from every Unison contract, so a revert anywhere in a call decodes by name. */
export const ALL_ERRORS: Abi = [
  ...UnisonHookAbi,
  ...UnisonHookFactoryAbi,
  ...UnisonLensAbi,
  ...UnisonLoopRouterAbi,
  ...UnisonSwapVMRouterAbi,
  ...UnisonTestTokenAbi,
  ...AquaAbi,
  // Uniswap v4's PoolManager wraps a hook's revert in WrappedError(target, selector, reason, details)
  ...parseAbi(["error WrappedError(address target, bytes4 selector, bytes reason, bytes details)"]),
].filter((x) => x.type === "error") as Abi;

/** Unwrap Uniswap's WrappedError (possibly nested) down to the hook's own error name. */
export function innerErrorName(name: string | undefined, args: readonly unknown[] | undefined): string | undefined {
  let n = name, a = args;
  for (let depth = 0; n === "WrappedError" && a && depth < 4; depth++) {
    try {
      const d = decodeErrorResult({ abi: ALL_ERRORS, data: a[2] as Hex });
      n = d.errorName;
      a = d.args as readonly unknown[] | undefined;
    } catch {
      break;
    }
  }
  return n;
}

const HUMAN: Record<string, string> = {
  MaxInRatio: "Trade too large: one trade can move at most 30% of a balance.",
  MaxOutRatio: "Trade too large: one trade can take at most 30% of a balance.",
  VenueLimit: "That venue has sold its current allowance of this token. Try the other venue or a smaller amount.",
  PortfolioPriceVenueLimit: "1inch has sold its current allowance of this token. Try Uniswap or a smaller amount.",
  InsufficientOutput: "The price moved: you would receive less than your minimum. Refresh the quote and try again.",
  TakerTraitsInsufficientMinOutputAmount: "The price moved below your minimum.",
  ZeroBalance: "This index holds none of that token.",
  ZeroAmount: "Enter an amount.",
  TokenNotInIndex: "That token is not part of this index.",
  NotMaker: "Only the index owner can do that.",
  LiquidityNotAccepted: "Unison pools don't take LP deposits: liquidity comes from the maker's wallet.",
  BadWeights: "Weights must each be at least 1% and add up to 100%.",
  PendingClaims: "Flush pending Uniswap input into the wallet first.",
  ERC20InsufficientBalance: "Not enough balance.",
  ERC20InsufficientAllowance: "Approval missing or too small.",
  SafeTransferFromFailed: "Token transfer failed (balance or approval).",
  StrategiesMustBeImmutable: "That strategy is already shipped.",
};

/** Turn any wallet / viem / contract error into one short, human sentence. */
export function prettyError(e: unknown): string {
  const msg = String((e as Error)?.message ?? e);
  if (/user rejected|user denied|rejected the request/i.test(msg)) return "Transaction rejected in your wallet.";
  if (/does not match the target chain|ChainMismatch/i.test(msg)) return "Your wallet is on another network. Switch it to Base Sepolia and try again.";
  if (/insufficient funds/i.test(msg)) return "Not enough ETH for gas. On Base Sepolia, get free test ETH from a faucet (Coinbase, Alchemy or QuickNode).";
  if (e instanceof BaseError) {
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = innerErrorName(rev?.data?.errorName, rev?.data?.args as readonly unknown[] | undefined);
    if (name) return HUMAN[name] ?? `Reverted: ${name}`;
    if (rev?.reason) return `Reverted: ${rev.reason}`;
    return e.shortMessage;
  }
  return msg.split("\n")[0].slice(0, 160);
}
