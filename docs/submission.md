# Submission pack

Copy-paste text for the ETHGlobal form, the five lines to say to judges, and what is left to do by hand.

## Form fields

**Project name:** Mohur

**Short description (≤100 chars):**
> One wallet, one price, every venue: a self-custodial index quoted on Uniswap v4 and 1inch Aqua.

**Description:**
> Mohur turns an ordinary self-custodial wallet into a weighted index (for example 40% ETH, 30% BTC, 30% USDC) that Uniswap v4 and 1inch Aqua both trade against at the same time, from the same coins, at the same price, with no oracle.
>
> A Uniswap v4 hook and a custom 1inch SwapVM instruction (opcode 0xd0) call one pricing function over the wallet's real balances. A fill on either venue changes the wallet, so both venues' next quotes move together. On a Base Sepolia fork the same trade quotes 0 wei apart on the two venues, and a 3-leg arbitrage loop across both loses about 0.8%.
>
> The pricing rule keeps the wallet at its target weights: when the market moves, traders rebalance it and pay it the fee. The maker can glide to new weights over hours ($25 instead of $1,991 for an instant switch on $100k in our tests), pause both venues in one click, or raise venue limits.
>
> The dashboard sends every chain read through the Ethereum Foundation's Anon-RPC (Tor, falling back to Nym), with a separate isolation key per maker, pair and trader, and shows every read live.

**How it's made:**
> Contracts (Solidity 0.8.30, Foundry, via-IR):
> - MohurHook, a custom-curve Uniswap v4 hook. `beforeSwap` returns a delta that cancels the AMM, pays the trader out of the wallet via `Aqua.pull` into the PoolManager, and holds the trader's input as ERC-6909 claims that are flushed to the wallet via `Aqua.push`.
> - PortfolioPrice, a custom SwapVM opcode added to the official AquaSwapVMRouter. It prices 1inch fills through the same hook and uses Aqua's virtual balances as per-venue caps.
> - MohurMath: weighted-pool math with Balancer's LogExpMath, rounding toward the maker, checked against an 80-digit Python reference.
>
> Our own security review found a critical cross-venue reentrancy: SwapVM taker callbacks could price a nested trade on stale balances, and the proof of concept took $752 from the maker. We fixed it with a fail-closed transient fill lock that 1inch maker hooks clear.
>
> Testing:
> - 59 Foundry tests, including fuzzed invariants and fork tests against the official V4Quoter and Universal Router on Base Sepolia.
> - 36 smoke checks on a live chain.
> - 15 Playwright browser tests that drive every screen against a fresh fork.
>
> Web: Next.js 15, viem and three.js, with @anon-rpc/browser-harness as the only read path. It deploys to GitHub Pages as a static export. `./scripts/demo.sh` runs the whole story in one command.

**Links:**
- GitHub: https://github.com/Abhist17/mohur
- Live app: https://abhist17.github.io/mohur/
- Explainer: https://github.com/Abhist17/mohur/blob/main/docs/explained.md
- Video: *(add after recording)*

**Tracks:**
- Uniswap: Build with Uniswap v4 hooks
- 1inch: Build an Aqua app
- Ethereum Foundation: Best use of Anon-RPC

## Five things to say to judges

1. **"Zero wei apart."** The same trade on Uniswap v4 and 1inch Aqua returns the identical amount, because both venues call one function over one wallet. Run `./scripts/demo.sh` or the Demo page and see it.
2. **"Arbitrage loses."** Any loop through the wallet, on one venue or across both, loses money. That is proven by fuzzing and shown live on the Arbitrage page (−0.8% for a 1 ETH loop).
3. **"The index manages itself."** When prices move, traders bring the wallet back to 40/30/30 and pay it a fee. Changing the mix gradually costs $25 instead of $1,991.
4. **"Nobody watching."** Every read goes through Anon-RPC with isolation keys per maker, pair and trader, and the Privacy page lists each one.
5. **"We attacked it ourselves."** Our review found a critical cross-venue reentrancy ($752 PoC), fixed with a fail-closed fill lock; AUDIT.md has the details. Also say the honest limits: Mohur does not reduce LVR, and it has not been externally audited.

## Still to do by hand

| # | Task | Why | How |
|---|---|---|---|
| 1 | **Deploy to Base Sepolia** | Without it the live site's trading screens show a "not live yet" explainer with screenshots instead of real data | `./scripts/setup-deployer.sh` (creates a fresh testnet wallet; you choose a password) or `cast wallet import mohur-deployer --interactive`, fund it with at least 0.005 Base Sepolia ETH (the full deploy is 34 transactions, ~21.7M gas, about 0.0002 ETH at today's gas price), then `./scripts/deploy-base-sepolia.sh`. It was rehearsed end to end on a chain-84532 fork: smoke 36/36. About 5 minutes, and it pushes when done so the live site rebuilds. |
| 2 | **Record the video** | Judges watch it first | Follow [demo-script.md](demo-script.md) |
| 3 | **Uniswap feedback form** | Needed for the Uniswap prize | Paste from [FEEDBACK.md](../FEEDBACK.md) |
| 4 | **Submit on ETHGlobal** | | Fields above, plus the video link |
| 5 | *(optional)* **Public proxy URL** | Shows reads arriving from Tor exits, which needs Tor to be up | Run `node proxy/server.mjs` behind a tunnel, build with `NEXT_PUBLIC_MOHUR_PROXY_URL` |
