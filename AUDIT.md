# Unison internal security review

**Date:** 6 November 2026 · **Commit reviewed:** `aef0740` and earlier · **Reviewer:** the Unison team (internal, not an independent audit)

## Scope

| Contract | Lines of interest |
| --- | --- |
| `contracts/src/MohurHook.sol` | pricing, v4 `beforeSwap` settlement, claims and flush, gradual weights, fill lock, maker hooks |
| `contracts/src/aqua/PortfolioPrice.sol` | SwapVM opcode `0xd0` |
| `contracts/src/aqua/MohurSwapVMRouter.sol`, `MohurStrategy.sol` | router extension, order construction |
| `contracts/src/libraries/MohurMath.sol` | weighted-pool math, rounding, bounds |
| `contracts/src/MohurHookFactory.sol`, `MohurLens.sol`, `MohurLoopRouter.sol` | deployment, reads, multi-leg routing |

Out of scope: Uniswap v4, 1inch Aqua / SwapVM and Balancer's LogExpMath (used as upstream; Aqua and SwapVM were audited by OpenZeppelin), the web app, and the Anon-RPC workers.

## Method

1. Line-by-line read of every in-scope contract against Unison's promises: one price on both venues, no profitable loops, the wallet changes only by fills, the maker approves only Aqua, each venue sells at most its limit.
2. Ordering review of every external call made while a trade is in flight: v4 unlock/settle order, SwapVM's `runLoop → maker hooks → taker callbacks → transfers` order.
3. Proof-of-concept tests for anything suspicious (`contracts/test/audit/`).
4. Property tests: fuzzing (1,000 runs per fuzz test) and an invariant suite (64 runs × 40 random actions over both venues).

## Findings

| ID | Severity | Title | Status |
| --- | --- | --- | --- |
| C-1 | **Critical** | Cross-venue reentrancy through SwapVM taker callbacks | **Fixed** in `aef0740` |
| L-1 | Low | A token could be removed from the index while its Uniswap input was still held as claims | Fixed in `c3064ce` |
| I-1 | Informational | Interpolated weights can sum to 1e18 ± a few wei during a gradual re-weight | Acknowledged |
| I-2 | Informational | 1inch can only sell ERC-20 in the wallet; Uniswap input waiting as claims is priced in but not sellable on 1inch until flushed | Acknowledged (documented) |
| I-3 | Informational | Unsupported tokens: fee-on-transfer, rebasing, and native ETH | Acknowledged (documented) |
| I-4 | Informational | Pricing reads the wallet's live balances; the maker spending index tokens elsewhere moves the quotes | Acknowledged (dedicated maker wallet, stated in the app) |

### C-1 Cross-venue reentrancy through SwapVM taker callbacks (Critical, fixed)

**What.** SwapVM prices a fill in `runLoop`, then calls taker callbacks (`preTransferIn/OutCallback`) **before** moving any coins. During that window the maker wallet's balances are unchanged, so a trade on the Uniswap venue (or another 1inch pair) inside the callback priced off the same pre-fill balances. Two trades in the same direction each avoided the other's price impact.

**Impact.** Value extraction from the maker, repeatable. PoC (`test/audit/CrossVenueReentrancy.t.sol`): two 4,000 USDC → ETH buys followed by a full sell-back. Done honestly this loses **$39.54** (fees). With the second buy nested in the callback it gained **$752.92**, taken from the maker.

**Fix.**
- `PortfolioPrice` calls `MohurHook.quoteAndLock` on real fills (not on `SwapVM.quote`). It is callable only by the trusted Unison router (`swapVM` immutable, set by the factory), and it sets a transient fill lock.
- `MohurHook.quote` reverts with `FillInProgress` while the lock is set. Both venues price through `quote`, so both are blocked during the window.
- Unison orders carry `postTransferIn` and `postTransferOut` maker hooks targeting the hook (router-only, maker-checked). The lock clears after **both** transfers.
- Fails closed: an order without the hooks leaves the lock set for the rest of that transaction, which blocks further pricing but cannot leak value.

**Verification.** The PoC now reverts with `FillInProgress()` (`0xf6b8f3d1`). `test/audit/FillLock.t.sol` checks that only the router can lock, an outsider can't clear the lock, it stays locked after one transfer, and it unlocks after both. Same-transaction 1inch → Uniswap routes still work (`LensLoop.t.sol`).

**Why the v4 side has no equivalent window.** In `beforeSwap` the hook pulls the output into the PoolManager and mints the input as claims before returning control, so `effectiveBalance` already reflects the trade before the router or trader runs any further code. The PoolManager enforces payment at the end of the unlock.

### L-1 Stranded claims on index change (Low, fixed)

`_flushAll` only iterates current index tokens. If `setIndex` dropped a token while input for it was held as claims, those claims could not be flushed. `setIndex` now reverts with `PendingClaims(token)` until the maker flushes. Test: `test_cannotDropTokenWithPendingClaims`.

### I-1 Weight interpolation rounding (Informational)

`weightOf` interpolates each token independently, so mid-glide weights can sum to 1e18 plus or minus a few wei. Pricing uses only weight ratios, so the effect is about 1e-18 relative, with no economic impact. The smoke test tolerates ±10 wei.

### I-2 to I-4 (Informational)

Documented in the README's honest limits and in the app (Launch, How it works).

## Other checks (no issue found)

- **Someone else's order pointing at our hook:** `PortfolioPrice` rejects it (`pricer.maker() == order.maker`) before `quoteAndLock`. Maker hooks reject `maker != hook.maker`. Test: `test_revert_pricerOfAnotherMaker`.
- **Pool creation:** only the maker, only index tokens (`beforeInitialize`). LP deposits are blocked (`beforeAddLiquidity`).
- **Approvals:** the maker approves only Aqua; the hook approves Aqua per flush with `forceApprove(amount)`. Invariant `invariant_onlyAquaApproved`.
- **Accounting:** `invariant_walletChangesOnlyByFills` (effective balances move exactly by fills and donations), and `invariant_claimsFullyBacked` (ERC-6909 claims held by the hook equal `pending`).
- **Loops and donations:** fuzzed round trips meet the proven loss floor; donate-then-swap never profits; any loop over any venue mix loses (fuzz); the weighted invariant never falls across trades (invariant).
- **Rounding:** every step rounds toward the maker. 111 vectors from an 80-digit reference are within 3e-14 of balance.
- **Bounds:** one trade moves at most 30% of a balance (keeps `pow` accurate); weights are each at least 1% and sum to 100%; fee is at most 10%.
- **Venue limits:** each venue stops exactly at its Aqua cap (`test_venueLimit_*`).

## Residual risks (not fixable in code)

- **LVR:** arbitrageurs who rebalance the wallet capture the move; Unison earns the fee and does not remove LVR.
- **Sandwiching:** as with any AMM, traders must set a minimum output. The Swap screen uses 0.5% slippage; `MohurLoopRouter.execute` takes `minOut`.
- **Anon-RPC trust:** the chosen worker sees every request and could censor or lie (see the anon-rpc trust model). The bootstrap read and wallet-broadcast transactions are not anonymised.
- **Not independently audited.** Testnet only, with test tokens.

## Test inventory

`forge test` runs 59 tests: math vectors and fuzzing, hook, instruction, cross-venue, lens/loop (including preview == live quote), re-weighting, manage, the audit PoC, fill-lock tests, the invariant suite, gas bounds, and 2 fork tests against the live Uniswap v4 on Base Sepolia. CI runs the 57 offline tests on every push (`.github/workflows/test.yml`).

`scripts/smoke.sh <network>` makes 36 read-only on-chain checks of a deployment; the full Base Sepolia deploy was rehearsed on a chain-84532 fork and passed all 36.

`cd web && npm run e2e` drives every screen in real Chrome against a fresh fork (15 specs), including the paths that touch these findings: venue parity after fills, losing loops run for real, and venue limits.
