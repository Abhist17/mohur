# Mohur

**One wallet, one price, every venue, nobody watching.**

Mohur turns a self-custodial wallet into a weighted index (for example 40% ETH / 30% BTC / 30% USDC)
that **Uniswap v4** and **1inch Aqua** both trade against at the same time, from the same coins, at the
same price, with no oracle. Every chain read the dashboard makes goes through the Ethereum Foundation's
**Anon-RPC**, with a separate isolation key per strategy.

> **One stockroom, two stalls.** The wallet is the stockroom. Uniswap and 1inch are two stalls selling
> from it. There is only one shelf, so there is only one price: a sale at either stall moves the shelf,
> and both price tags change together. Nothing has to be synced.

The name is the Mohur, a Mughal gold coin. Built at ETHGlobal (hack day 5–6 Nov 2026).

## What to remember

| Claim | Evidence (this repo's tests) |
| --- | --- |
| **One inventory, two venues.** A v4 hook and a custom 1inch SwapVM instruction call the same pricing function over the wallet's real balances. | 0 units of difference between venues, all 6 directions, exact-in and exact-out (`CrossVenue.t.sol`). Official **V4Quoter** on Base Sepolia returns exactly the hook's quote (`test/fork`). |
| **It can't be gamed.** Any loop through the wallet, on one venue or across both, loses. | 3-leg loop ETH→USDC (Uniswap) → BTC (1inch) → ETH (Uniswap) of 0.1 ETH loses **88 bps**; fuzzed loops over any venue mix always lose; round trips lose at least the proven floor `a·f·B/(B + a(1−f))`. |
| **It rebalances itself.** When the market moves, traders buy what is cheap from you until the mix is back on target. | ETH 4,000 → 5,000, arbitrage alone restores **40.01 / 29.99 / 29.99**. |
| **Nobody watches you.** | 100% of app reads go through Anon-RPC (Tor by default) on Base Sepolia, keys per maker / strategy / trader, live read log, logging proxy. |
| **Honest limit.** Mohur does not reduce LVR against the outside market. The traders who rebalance you capture the move; you earn the fee. | The landing page states the cost: at ETH $6,400 a $100k index trails holding by ~$3,316 before fees. |

## How it works

Every quote on both venues comes from one weighted-pool formula over the wallet's real balances
(`w` = target weight, `B` = balance held, `f` = 0.30% flat fee):

```
spot price of i in j      p = (w_i / w_j) · (B_j / B_i)
tokens out for input a    out = B_j · (1 − (B_i / (B_i + a(1−f)))^(w_i / w_j))
```

- **One inventory.** Both venues read the same balances. A fill on Uniswap changes the wallet, so the very next 1inch quote reflects it, and the other way round.
- **Loops lose.** Without fees every trade preserves the invariant ∏B^w, so a loop that returns to its start token returns exactly what went in. Fees only add to the wallet and every rounding step favours the maker.
- **Self-rebalancing.** At Mohur's own prices a weighted pool is always on target. When the outside price moves by `k`, arbitrage leaves `B_ETH·k^(w−1)` ETH and `B_j·k^w` of each other token: back on weight by value.
- **Limits.** One trade moves at most 30% of a balance (keeps the fixed-point `pow` accurate). Each venue has its own selling limit, enforced by Aqua (50% of each balance at launch).

```
 Trader (any v4 router)                    Trader (1inch taker)
          │                                         │
     MohurHook ── quote ──► price() ◄── quote ── PortfolioPrice (SwapVM 0xd0)
   (beforeSwap)          MohurMath            in MohurSwapVMRouter
          │ settle                                  │ settle
          └──────────────►  1inch Aqua  ◄───────────┘
                     (pull/push, per-venue limit)
                              │
                         Maker wallet  (its ONLY approval is to Aqua)

 Dashboard ── every read ──► Anon-RPC (Tor) ──► Base Sepolia RPC
```

## Contracts (`contracts/src`)

| Contract | Venue | What it does |
| --- | --- | --- |
| `libraries/MohurMath.sol` | both | Spot price, exact-in / exact-out quotes, weight & fee checks, decimals. Fixed point, every rounding step in the maker's favour. Uses Balancer v3's `LogExpMath` (MIT) for `pow`. |
| `MohurHook.sol` | Uniswap v4 | Custom-curve hook. `beforeSwap` prices from the wallet and cancels the AMM with a return delta. Pays the trader straight out of the wallet (`sync` → `Aqua.pull` into the PoolManager → `settle`). The trader's input is minted as ERC-6909 claims held for the maker, counted as inventory immediately, and moved into the wallet via `Aqua.push` on the next swap or a permissionless `flush()` (transient storage stops it flushing input paid in the same tx). Blocks LP deposits; only the maker can create pools, only for index tokens. Exposes `quote()`, `price()`, `effectiveBalance()` for both venues. |
| `MohurHookFactory.sol` | Uniswap v4 | CREATE2 factory, one hook per maker; the dashboard mines the hook address in the browser. |
| `aqua/PortfolioPrice.sol` | 1inch Aqua | Custom SwapVM instruction (opcode `0xd0`, in the unallocated `0xd0–0xef` bank). Keeps Aqua's virtual balance as this venue's selling limit, prices through the hook's `quote()`, refuses a hook that belongs to another maker. |
| `aqua/MohurSwapVMRouter.sol` | 1inch Aqua | The official `AquaSwapVMRouter`, unchanged, plus one opcode. 22.7 KB runtime (< 24 KB). |
| `aqua/MohurStrategy.sol` | 1inch Aqua | Builds the Aqua-shipped SwapVM order for a pair: optional stock `Salt`, then `PortfolioPrice(hook)`. |
| `MohurLens.sol` | app | The whole book in one call, quotes from both venues in one `eth_call`, exact multi-leg route quotes. |
| `MohurLoopRouter.sol` | app | Runs a multi-leg route across both venues in one transaction (the "Arbitrage me" demo). |
| `MohurTestToken.sol` | testnet | Clearly labelled faucet tokens (tWETH, tWBTC, tUSDC). |

Pinned dependencies: `swap-vm` main @ `e91dea5`, `aqua` `v1.0.2-rc.2`, `@1inch/solidity-utils` 7.0.3,
`v4-periphery` main (with `v4-core`). Aqua and SwapVM are not deployed on any testnet, so the deploy
script deploys the official Aqua source and the Mohur router on Base Sepolia; Uniswap v4 (PoolManager,
V4Quoter, Universal Router, Permit2) is the real Base Sepolia deployment.

## Tests

```bash
cd contracts
npm install                                  # @1inch/solidity-utils, @openzeppelin (as upstream does)
git submodule update --init --recursive
npm run build:v4                             # builds the real v4 PoolManager artifact (solc 0.8.26)
forge test --no-match-path 'test/fork/*'     # 38 tests
forge test --match-path 'test/fork/*'        # 2 fork tests against live Uniswap v4 on Base Sepolia
python3 reference/mohur_math.py              # regenerates the 80-digit reference vectors
```

| Suite | Covers |
| --- | --- |
| `MohurMath.t.sol` | 111 vectors from an 80-digit Python reference (within 3×10⁻¹⁴ of balance, always on the maker's side); fuzzed round-trip floor; fee-free invariant never decreases; donation-then-swap never profits; guards. |
| `MohurHook.t.sol` | Pays from wallet, prices from wallet, exact-out, claims flush via Aqua (re-crediting the venue limit), permissionless flush, a token cannot leave the index with claims pending, venue limit stops at the Aqua cap while the wallet keeps the rest, no LP, maker-only pools, scoped approvals. |
| `PortfolioPrice.t.sol` | Program layout, quote == hook quote, real Aqua push/pull, exact-out, venue limit = Aqua virtual balance, refuses another maker's hook. |
| `CrossVenue.t.sol` | Same price (6 directions × 2 modes), fills move the other venue, loops lose (fixed + fuzzed), self-rebalancing, only Aqua is approved. |
| `LensLoop.t.sol` | A cross-venue loop returns exactly its Lens quote leg by leg; quoteBoth; book; minOut. |
| `fork/V4BaseSepolia.t.sol` | Official V4Quoter == hook quote; a real Universal Router swap pays from the maker wallet. |

## The app (`web/`)

Next.js 15 + viem + three.js. Everything shown comes from the chain or is labelled *simulated* / *example*.

- **Landing:** a scroll-told 3D scene. The wallet is three stacks of coins (gold ETH, copper BTC, silver USDC) feeding two counters (Uniswap, 1inch) that show the same live price. Stages cover: the problem (two piles, drifting prices), one pile, one price, drag the market (rebalancing with the contracts' formula and the honest LVR cost), loops lose (a live on-chain loop quote), and private.
- **Create:** assets and weights (sliders always sum to 100%), simulated quote preview per pair.
- **Launch:** six real steps from your wallet (deploy your own hook with an address mined in the browser, test tokens, approve Aqua only, set weights, open v4 pools + ship the Uniswap venue, ship 1inch Aqua strategies). Each step resumes from chain state.
- **Live book:** weights vs target, identical quotes on both venues per pair, remaining venue limits, one fill feed for both venues, fees earned, flush button.
- **Arbitrage me:** build any route across venues, quote it exactly, run it for real.
- **Privacy:** every chain read live (route, label, isolation key, latency), worker switcher (Tor / Nym / passthrough), who-learns-what, logging-proxy view.

### Privacy: Anon-RPC

`web/src/lib/anon.ts` is the only read path: one viem custom transport built on `@anon-rpc/browser-harness`.

- **Network:** Tor (`tor-js`) by default; Nym and the passthrough reference worker can be picked on the Privacy screen. Specifiers from the anon-rpc `adopters.json5`.
- **Isolation keys:** one per maker (book, fills, launch, receipts), one per strategy (each pair's quotes and limits), one per trader, plus `public`.
- **Exclusions, stated in the app:** the one bootstrap read of the worker's specifier contract on mainnet (it has to happen before the anonymous client exists), and transactions, which the user's wallet broadcasts. On the local fork, reads go straight to the local node (no anonymity network can reach localhost) and a banner says so.
- **Robustness:** a non-JSON reply (e.g. a Cloudflare page served to a Tor exit) falls through to the next Base Sepolia RPC; log queries run in 200-block chunks.
- **Logging proxy** (`proxy/server.mjs`, no dependencies): forwards JSON-RPC and logs only time, source IP, whether it is a Tor exit, and the method. Point `NEXT_PUBLIC_MOHUR_PROXY_URL` at it and the Privacy screen shows requests arriving from Tor exits.

## Run it

**Local fork (everything, including the UI):**

```bash
anvil --fork-url https://sepolia.base.org --chain-id 31337
cd contracts
K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil dev keys
K1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
K2=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
forge script script/DeployMohur.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key $K0
forge script script/LaunchIndex.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key $K1
forge script script/DemoTrades.s.sol  --rpc-url http://127.0.0.1:8545 --broadcast --private-key $K2
cd ../web && npm install && npm run sync && npm run dev   # http://localhost:3000, Connect → Local dev accounts
```

**Base Sepolia:**

```bash
cast wallet import mohur-deployer --interactive   # a funded test key (~0.02 Base Sepolia ETH)
./scripts/deploy-base-sepolia.sh                  # deploy, launch demo index, demo fills, sync
cd web && NEXT_PUBLIC_MOHUR_NETWORK=base-sepolia npm run dev   # every read through Anon-RPC
# optional: UPSTREAM=https://sepolia.base.org node proxy/server.mjs, expose it, set NEXT_PUBLIC_MOHUR_PROXY_URL
```

## Honest limits

- Mohur does not reduce LVR against the outside market; it earns the fee on the trades that rebalance it.
- A round trip doesn't always lose a full fee: part of the first leg's fee is won back by the return leg. Every loop still loses.
- Uniswap input waits as claims until the next swap or a flush. It is priced in immediately, but 1inch can only sell what is in the wallet as ERC-20.
- Venue limits are fixed at launch and shrink as a venue sells (Uniswap's grows back as its input is flushed via `Aqua.push`). Topping up 1inch means shipping a new strategy.
- Testnet demo with test tokens. Not audited.

## Repo map

| Folder | Contents |
| --- | --- |
| `contracts/` | Foundry project: `src`, `test` (38 + 2 fork), `script` (DeployMohur, LaunchIndex, DemoTrades), `reference` (Python math) |
| `web/` | Next.js dashboard; `src/lib/anon.ts` is the Anon-RPC transport |
| `proxy/` | Logging JSON-RPC proxy |
| `docs/` | PortfolioPrice write-up, Anon-RPC notes, demo script |
| `scripts/` | `deploy-base-sepolia.sh` |
