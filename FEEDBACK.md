# Uniswap v4 developer feedback (from building Tenbin)

Tenbin's `TenbinHook` is a custom-curve hook that prices from, and settles to, an external wallet
(through 1inch Aqua) instead of pool liquidity. Notes from building it on 5–6 Nov 2026:

## What worked well

- **Return deltas are the right primitive.** `beforeSwapReturnDelta` let us cancel the AMM completely and
  quote from any formula; the PoolManager short-circuits the AMM when the remaining amount is 0.
- **The real infra just works with a custom curve.** On a Base Sepolia fork, the official `V4Quoter`
  returned exactly our hook's quote, and a Universal Router `V4_SWAP` (Permit2 → `SETTLE_ALL` / `TAKE_ALL`)
  paid the trader straight out of the maker's wallet with no changes on our side.
- **ERC-6909 claims** are a clean way for a hook to accept input it can't forward yet.

## Friction

1. **Input isn't in the PoolManager during `beforeSwap`.** Standard routers settle the trader's input
   *after* `swap` returns, so a hook that wants the input as ERC-20 can't `take` it in `beforeSwap`
   unless the PoolManager happens to hold that token from other pools. The `CustomCurveHook` example
   does `take`, which silently relies on that. We mint claims instead and flush them later. A note in the
   custom-curve docs about this (and the claims pattern) would save people time.
2. **Flushing claims safely needs transient bookkeeping.** Claims minted in the current transaction are
   not yet backed by a settled payment, so flushing them inside a later swap in the *same* unlock can fail.
   We track "minted this tx" in transient storage. A documented pattern (or helper) would help.
3. **Compiler mix.** `PoolManager` pins `0.8.26`; SwapVM / Aqua pin `0.8.30`. Tests that need a real
   PoolManager had to deploy it from a separately compiled artifact (`vm.deployCode`). Publishing the
   PoolManager bytecode/artifact (or relaxing the pragma on the test utilities) would simplify integration.
4. **`ExactInputSingleParams` drift.** `v4-periphery` main has a new field (`minHopPriceX36`) that the
   Universal Router deployed on Base Sepolia does not; encoding against main's struct silently breaks
   live swaps. Versioned struct docs per deployment would help.
5. **`BaseHook` moved out of `v4-periphery`.** Older tutorials import it from periphery; we implemented
   `IHooks` directly.
6. **Hook address mining in the browser** is easy with CREATE2 + a factory, but a canonical JS helper next
   to `HookMiner` would make "deploy your own hook" flows standard.
7. **`WrappedError` hides the hook's revert reason from apps.** A hook revert reaches the caller wrapped
   in `CustomRevert.WrappedError(target, selector, reason, details)`. viem and wallets show only
   "WrappedError", so a user sees nothing useful. We unwrap the inner reason ourselves
   (`web/src/lib/errors.ts`). A small decoding helper in the SDK, or a note in the hooks docs, would
   make hook errors readable everywhere.
8. **Hooks that share inventory with another venue need a cross-venue lock.** The v4 side was safe
   (`beforeSwap` moves both legs before returning). But our own review found that a fill on another venue
   with taker callbacks could re-enter the hook's pricing on stale balances (AUDIT.md, C-1). We fixed it
   with a transient fill lock. A short "sharing state with external venues" section in the hook security
   docs would help other hook authors avoid this.
