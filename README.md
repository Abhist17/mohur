<div align="center">

# Tenbin

### One wallet. One price. Every venue. Nobody watching.

<img src="web/src/app/icon.svg" width="72" alt="Tenbin logo: a balance beam held level over two pans (two venues, one price)" />

A self-custodial **weighted index** (40% ETH · 30% BTC · 30% USDC) that **Uniswap v4** and **1inch Aqua** both trade, from the same wallet, at the same price, with no oracle. The dashboard reads the chain privately through the Ethereum Foundation's **Anon-RPC**.

**Use it: [abhist17.github.io/tenbin](https://abhist17.github.io/tenbin/)** · live on Base Sepolia · demo index [`0xb687…6888`](https://sepolia.basescan.org/address/0xb6879F5F560597B7C1dbfA176c4ac6928Eac6888) · [developer docs](https://abhist17.github.io/tenbin/docs/) · [plain-words explainer](docs/explained.md)

[![Tests](https://github.com/Abhist17/tenbin/actions/workflows/test.yml/badge.svg)](https://github.com/Abhist17/tenbin/actions/workflows/test.yml) [![Live app](https://img.shields.io/badge/live-abhist17.github.io%2Ftenbin-0d7349)](https://abhist17.github.io/tenbin/)

ETHGlobal 2026 · Uniswap v4 hooks × 1inch Aqua × Ethereum Foundation Anon-RPC

<img src="docs/media/landing.jpg" alt="The Tenbin home page: 'Stop splitting your coins across exchanges' next to a live price board where Uniswap and 1inch quote the same trade 0 wei apart." width="100%" />

</div>

---

## For judges: try it in 60 seconds

1. Open **[abhist17.github.io/tenbin](https://abhist17.github.io/tenbin/)**. Every read goes through Anon-RPC, so the pill in the header says *connecting…* for up to a minute before the numbers appear. That wait is the privacy. The **price board** then shows one wallet and both venues quoting the same trade **0 wei apart**.
2. Open **Book**: *Same quote on both venues* (Δ = 0 for every pair), *Same price at every size* (the 1inch line runs exactly along the Uniswap band), depth read from the wallet, and every real fill by venue.
3. Drag **Move the market** on the Book: if nobody traded, the wallet's ETH share would drift; traders bring it back to 40% and pay the wallet a fee.
4. Open **Arbitrage**: the 3-leg loop across both venues is quoted live, and every loop size **loses**.
5. Open **Privacy**: every read with its route, isolation key and latency. **Test the route** reads Base Sepolia through the mixnet.
6. To trade, connect a wallet on Base Sepolia (a hint links faucets if it has no test ETH). **Demo → Run the demo** makes six real transactions and turns three tiles green: **0 wei · Exact · −0.8%**. A swap on **Swap** ends with a receipt: *the other venue quoted exactly the same*.
7. The fastest full experience, with instant reads on a local copy of Base Sepolia:

   ```bash
   git clone --recursive https://github.com/Abhist17/tenbin && cd tenbin && (cd contracts && npm ci) && (cd web && npm ci) && ./scripts/demo.sh
   ```

## Why this exists

To earn trading fees on more than one exchange today, a market maker **splits its coins**: one pile per venue. Each pile gets its own price, the prices drift apart, and arbitrageurs live off the gap at the maker's expense. Rebalancing the portfolio is a job of its own, and every RPC provider the maker uses learns exactly which book it runs and what it watches.

Tenbin removes the split:

| | Split across venues (today) | One pool on one venue | **Tenbin** |
|---|---|---|---|
| Where the coins sit | A pile per venue | In the pool contract | **In your own wallet** |
| Prices on two venues | Two, drifting apart | One venue only | **One, 0 wei apart** |
| Arbitrage between venues | Drains the maker | n/a | **Impossible: every loop loses** |
| Rebalancing | Manual or a bot | Inside one pool | **Traders do it and pay you the fee** |
| Changing the mix | Sell and buy yourself | Withdraw and redeposit | **Glide: $25 instead of $1,991 on $100k** |
| Approvals | Each venue | The pool | **One: 1inch Aqua** |
| Who sees your reads | The RPC provider | The RPC provider | **Nobody: Anon-RPC** |

> **One stockroom, two stalls.** Raju keeps mangoes, rice and cash in one stockroom and opens two stalls in two markets. Both stalls sell from the same shelf and read one price board. A sale at either stall changes the shelf, so both price tags move together. Nobody can buy cheap at one stall and sell dear at the other.

*Tenbin* (天秤) is the Japanese balance scale: one beam, two pans, held perfectly level. A balanced index, weighed the same by both venues.

## How it works

Who talks to what. Both venues ask **one** price function (`TenbinHook.quote()`) over **one** wallet; coins only ever move through 1inch Aqua, the wallet's single approval. The app reads everything privately through Anon-RPC.

```mermaid
flowchart LR
    subgraph Traders
        T1["Any Uniswap v4 router<br/>(Universal Router, aggregators)"]
        T2["1inch taker<br/>(SwapVM order)"]
        T3["TenbinLoopRouter<br/>(multi-leg, both venues)"]
    end
    subgraph Uniswap["Uniswap v4"]
        PM["PoolManager"]
        H["TenbinHook<br/>custom curve, beforeSwap"]
    end
    subgraph OneInch["1inch Aqua"]
        R["TenbinSwapVMRouter<br/>AquaSwapVMRouter + opcode 0xd0"]
        PP["PortfolioPrice (0xd0)"]
        AQ["Aqua<br/>venue limits = virtual balances"]
    end
    M{{"TenbinMath<br/>weighted-pool price"}}
    W[("Maker wallet<br/>40% ETH · 30% BTC · 30% USDC<br/>only approval: Aqua")]
    T1 --> PM --> H
    T2 --> R --> PP
    T3 --> PM
    T3 --> R
    H -- "quote()" --> M
    PP -- "quoteAndLock()" --> H
    M -. reads balances .-> W
    H -- "pull output / push input" --> AQ
    R -- "pull output / push input" --> AQ
    AQ <--> W
    subgraph App["Tenbin app (Next.js, GitHub Pages)"]
        UI["Swap · Book · Demo · Arbitrage<br/>My index · Privacy · Docs"]
        L["TenbinLens<br/>book, quoteBoth, quoteRoute"]
    end
    UI -- "every read" --> AR["Anon-RPC<br/>Tor, falls back to Nym"]
    AR --> RPC[("Base Sepolia RPC")]
    UI -- "eth_call via Anon-RPC" --> L
    UI -- "transactions (your wallet)" --> T3
```

1. **One wallet.** The maker approves one contract, **1inch Aqua**. Aqua gives each venue a *selling limit* (a virtual balance), not the coins: they stay in the wallet until a trade fills.
2. **One price function.** `TenbinHook.quote()` prices every trade with weighted-pool math over the wallet's real balances (plus Uniswap input still held as claims). The Uniswap v4 hook calls it in `beforeSwap`; the 1inch SwapVM instruction (opcode `0xd0`) calls it in its program. There is nothing to sync.
3. **Coins move through Aqua.** On either venue the output is pulled from the wallet and the input is pushed back to it. A fill on one venue changes the balances, so the other venue's next quote already knows.
4. **The market rebalances it.** The price rule makes a coin cheaper the more the wallet holds of it, so when prices move, traders buy what is cheap until the wallet is back on target, and pay the 0.30% fee for it.
5. **Nobody watching.** The dashboard's only read path is Anon-RPC (Tor, falling back to Nym), with a separate isolation key per maker, pair and trader.

### The price rule

Every quote on both venues comes from one weighted-pool formula (`w` = target weight, `B` = balance held, `f` = 0.30% fee):

```
spot price of i in j      p = (w_i / w_j) · (B_j / B_i)
tokens out for input a    out = B_j · (1 − (B_i / (B_i + a(1−f)))^(w_i / w_j))
```

- **The venues agree** because they call the same function over the same balances: **0 wei** apart in every direction, exact-in and exact-out.
- **Loops lose.** Without fees every trade keeps ∏B^w constant, so a loop back to the start token returns at most what went in; the fee is then taken on every leg and every rounding step favours the maker. A 1 ETH loop across both venues comes back **−0.81%**.
- **It rebalances itself.** After ETH moves 25%, arbitrage alone restores **40.01 / 29.99 / 29.99**.
- **Changing the mix** with `scheduleWeights` glides the target over time, so traders walk the wallet there in small, fee-paying trades: **$25** instead of **$1,991** for an instant switch on $100k.
- **Limits.** One trade moves at most 30% of a balance; each venue sells only up to its Aqua limit.

### Claims, and the test behind each

| Claim | Evidence (this repo's tests) |
| --- | --- |
| **One inventory, two venues.** A v4 hook and a custom 1inch SwapVM instruction call the same pricing function over the wallet's real balances. | 0 units of difference between venues, all 6 directions, exact-in and exact-out (`CrossVenue.t.sol`). Official **V4Quoter** on Base Sepolia returns exactly the hook's quote (`test/fork`). |
| **It can't be gamed.** Any loop through the wallet, on one venue or across both, loses. | 3-leg loop ETH→USDC (Uniswap) → BTC (1inch) → ETH (Uniswap) of 0.1 ETH loses **88 bps**; fuzzed loops over any venue mix always lose; round trips lose at least the proven floor `a·f·B/(B + a(1−f))`. |
| **It rebalances itself.** When the market moves, traders buy what is cheap from you until the mix is back on target. | ETH 4,000 → 5,000, arbitrage alone restores **40.01 / 29.99 / 29.99**. |
| **New: change your allocation without paying to rebalance.** `scheduleWeights` glides the target weights on both venues at once, so the market walks the wallet to the new mix through small, fee-paying trades. | Moving a $100k index 40/30/30 → 50/25/25 at constant prices: instant switch costs **$1,991** to arbitrage, a 50-step glide costs **$25**; both reach 50% ETH (`Reweight.t.sol`). |
| **The maker stays in control.** Pause both venues in one click; resume, top up or re-split under a new epoch. | `Manage.t.sol`: pause stops both venues and leaves the wallet untouched; resume re-opens both with identical quotes. |
| **Nobody watches you.** | 100% of app reads go through Anon-RPC (Tor by default) on Base Sepolia, keys per maker / strategy / trader, live read log, logging proxy. |
| **Honest limit.** Tenbin does not reduce LVR against the outside market. The traders who rebalance you capture the move; you earn the fee. | The landing page states the cost: at ETH $6,400 a $100k index trails holding by ~$3,316 before fees. |

### A trade on Uniswap v4

```mermaid
sequenceDiagram
    autonumber
    participant T as Trader (any v4 router)
    participant PM as Uniswap PoolManager
    participant H as TenbinHook
    participant AQ as 1inch Aqua
    participant W as Maker wallet
    T->>PM: swap 1,000 USDC for ETH
    PM->>H: beforeSwap
    H->>H: quote() from wallet balances
    H->>AQ: pull ETH (counts against Uniswap's limit)
    AQ->>W: transferFrom ETH
    W-->>PM: ETH paid into the PoolManager
    H->>PM: mint the trader's USDC as claims for the maker
    H-->>PM: return delta (the pool's own curve never runs)
    PM-->>T: ETH out, USDC in
    Note over H,W: Next swap or anyone's flush(): claims to USDC, Aqua.push into the wallet
```

### A trade on 1inch Aqua

```mermaid
sequenceDiagram
    autonumber
    participant T as Taker (1inch)
    participant VM as TenbinSwapVMRouter
    participant PP as PortfolioPrice (0xd0)
    participant H as TenbinHook
    participant AQ as 1inch Aqua
    participant W as Maker wallet
    T->>VM: swap(order, 1,000 USDC)
    VM->>PP: run opcode 0xd0
    PP->>H: quoteAndLock() (the same quote as Uniswap, lock ON)
    PP->>PP: check this venue's limit
    VM->>AQ: pull ETH from the wallet to the taker
    VM->>AQ: push USDC from the taker into the wallet
    VM->>H: postTransferIn and postTransferOut (lock OFF)
```

### Contract map

What each contract is for and how they connect (arrows: *deploys*, *calls*, *reads*).

```mermaid
flowchart TB
    F["TenbinHookFactory<br/>CREATE2, one hook per maker"] -- deploys --> H["TenbinHook<br/>quote · quoteAndLock · flush<br/>scheduleWeights · venue epochs"]
    H -- uses --> M["TenbinMath<br/>spotPrice · outGivenIn · inGivenOut<br/>(Balancer LogExpMath)"]
    H -- uses --> P["TenbinPools<br/>canonical v4 pool keys"]
    S["TenbinStrategy<br/>builds the Aqua-shipped order"] -- "program: Salt + 0xd0(hook)" --> PP["PortfolioPrice<br/>SwapVM opcode 0xd0"]
    R["TenbinSwapVMRouter"] -- "runs" --> PP
    PP -- "quoteAndLock (real fill)<br/>quote (static)" --> H
    R -- "postTransferIn / Out<br/>clear the fill lock" --> H
    LoopR["TenbinLoopRouter"] -- "v4 legs" --> PM["Uniswap v4 PoolManager"]
    LoopR -- "1inch legs" --> R
    PM -- "beforeSwap" --> H
    L["TenbinLens"] -. reads .-> H
    L -. reads .-> AQ["1inch Aqua"]
    H -- "pull / push" --> AQ
    R -- "pull / push" --> AQ
```

| Contract | Venue | What it does |
| --- | --- | --- |
| `libraries/TenbinMath.sol` | both | Spot price, exact-in / exact-out quotes, weight & fee checks, decimals. Fixed point, every rounding step in the maker's favour. Uses Balancer v3's `LogExpMath` (MIT) for `pow`. |
| `TenbinHook.sol` | Uniswap v4 | Custom-curve hook. `beforeSwap` prices from the wallet and cancels the AMM with a return delta. Pays the trader straight out of the wallet (`sync` → `Aqua.pull` into the PoolManager → `settle`). The trader's input is minted as ERC-6909 claims held for the maker, counted as inventory immediately, and moved into the wallet via `Aqua.push` on the next swap or a permissionless `flush()` (transient storage stops it flushing input paid in the same tx). Blocks LP deposits; only the maker can create pools, only for index tokens. Exposes `quote()`, `price()`, `effectiveBalance()` for both venues. |
| `TenbinHookFactory.sol` | Uniswap v4 | CREATE2 factory, one hook per maker; the dashboard mines the hook address in the browser. |
| `aqua/PortfolioPrice.sol` | 1inch Aqua | Custom SwapVM instruction (opcode `0xd0`, in the unallocated `0xd0–0xef` bank). Keeps Aqua's virtual balance as this venue's selling limit, prices through the hook's `quote()`, refuses a hook that belongs to another maker. |
| `aqua/TenbinSwapVMRouter.sol` | 1inch Aqua | The official `AquaSwapVMRouter`, unchanged, plus one opcode. 22.8 KB runtime (< 24 KB). |
| `aqua/TenbinStrategy.sol` | 1inch Aqua | Builds the Aqua-shipped SwapVM order for a pair: optional stock `Salt`, then `PortfolioPrice(hook)`. |
| `TenbinLens.sol` | app | The whole book in one call, quotes from both venues in one `eth_call`, exact multi-leg route quotes. |
| `TenbinLoopRouter.sol` | app | Runs a multi-leg route across both venues in one transaction (the "Arbitrage me" demo). |
| `TenbinTestToken.sol` | testnet | Clearly labelled faucet tokens (tWETH, tWBTC, tUSDC). |

Pinned dependencies: `swap-vm` main @ `e91dea5`, `aqua` `v1.0.2-rc.2`, `@1inch/solidity-utils` 7.0.3,
`v4-periphery` main (with `v4-core`). Aqua and SwapVM are not deployed on any testnet, so the deploy
script deploys the official Aqua source and the Tenbin router on Base Sepolia; Uniswap v4 (PoolManager,
V4Quoter, Universal Router, Permit2) is the real Base Sepolia deployment.

### Venue lifecycle and gradual weights

```mermaid
stateDiagram-v2
    [*] --> Live: launch (epoch 0) ships both venues to Aqua
    Live --> Paused: Pause both venues (Aqua.dock)
    Paused --> Live: Resume (new epoch, re-ship with new limits)
    Live --> Live: Top up / re-split (dock, new epoch, re-ship)
    Live --> Gliding: scheduleWeights (e.g. 40/30/30 to 50/25/25 over 1 h)
    Gliding --> Live: glide ends at the new target
```

### Private reads

```mermaid
stateDiagram-v2
    [*] --> Tor: app opens (Base Sepolia)
    Tor --> Ready: bootstrapped within 35 s
    Tor --> Nym: no answer in 35 s
    Nym --> Ready: bootstrapped within 90 s
    Nym --> Banner: no answer in 90 s
    Banner --> Tor: Retry
    Banner --> Direct: user clicks Continue without privacy
    Direct --> Tor: Try private again
    Ready --> Ready: every read, one isolation key per maker / pair / trader
```

Nothing is ever read directly unless the user chooses it, and every such read is logged as `direct (not private)`.

`web/src/lib/anon.ts` is the only read path: one viem custom transport built on `@anon-rpc/browser-harness`.

- **Network:** Tor (`tor-js`) by default; Nym and the passthrough reference worker can be picked on the Privacy screen. Specifiers from the anon-rpc `adopters.json5`. If Tor can't bootstrap within 35 s (e.g. its gateway is down), the app falls back to Nym, which also anonymises, and logs why. Nym gets 90 s to start (it downloads an ~18 MB bundle). It never falls back silently to the non-anonymising passthrough. If every anonymity network fails, a banner says so and offers **Retry** or **Continue without privacy**: nothing is read until the user chooses, and every read made that way is logged as `direct (not private)` (e2e `forced outage` blocks Tor and Nym to prove it). `NEXT_PUBLIC_TENBIN_WORKER` sets the default.
- **Live check (6 Nov 2026):** the EF demo Tor gateway was unreachable; through Nym, Base Sepolia answered in ~6 s (worker ready in ~9–11 s). The Privacy screen's "Test the route" button reproduces this.
- **Isolation keys:** one per maker (book, fills, launch, receipts), one per strategy (each pair's quotes and limits), one per trader, plus `public`.
- **Exclusions, stated in the app:** the one bootstrap read of the worker's specifier contract on mainnet (it has to happen before the anonymous client exists), and transactions, which the user's wallet broadcasts. On the local fork, reads go straight to the local node (no anonymity network can reach localhost) and a banner says so.
- **Self-recovery:** the one bootstrap read tries four mainnet RPCs in turn, and if every private route fails the app retries it by itself (after 5 s, 20 s and 60 s), still private; screens re-read the moment it is back. Added on 7 Nov after one dropped connection left the live site empty.
- **Robustness:** 25 s per-request timeout; a non-JSON reply (e.g. a Cloudflare page served to a Tor exit) or a timeout falls through to the next Base Sepolia RPC. Fill history uses 10,000-block `eth_getLogs` chunks on publicnode (one request per day of history) and drops to 200-block chunks automatically on RPCs that cap the range (`sepolia.base.org`).
- **Logging proxy** (`proxy/server.mjs`, no dependencies): forwards JSON-RPC and logs only time, source IP, whether it is a Tor exit, and the method. Point `NEXT_PUBLIC_TENBIN_PROXY_URL` at it and the Privacy screen shows requests arriving from Tor exits.

## What's in the app

Next.js 15 + viem (charts are plain SVG). Everything shown comes from the chain or is labelled *simulated* / *example*.
Every transaction gets a toast (confirm in wallet → submitted, with explorer link → confirmed), and contract
reverts are decoded into plain sentences ("Trade too large: one trade can move at most 30% of a balance").

- **Landing:** the hook ("Stop splitting your coins across exchanges."), a live price board (one wallet, both venues quoting the same trade, 0 wei apart), the idea told as a shop (Today vs With Tenbin, one shelf, the trade flow), the real `demo.sh` receipts, a checklist where every claim links to its test, what we checked and what it doesn't do, a developer teaser and an FAQ.
- **Charts** (plain SVG, hover tooltips, a table view on each): Book, *same price at every size* (both venues quoted live at 9 sizes, the lines coincide), *depth read from the wallet* (how much ETH it buys or sells at each price, capped at venue limits) and *ETH price fill by fill* (every real fill, by venue); Arbitrage, *any size loses* (your loop quoted at 6 sizes); My index, *Tenbin vs just holding* as ETH moves (pool formula, LVR shown honestly); Privacy, *time per read*.
- **Move the market** (Book): drag ETH's outside price; a chart shows the wallet's ETH share *if nobody traded* drifting away from target and *after traders rebalance* staying on it, with what traders would do, their profit and the fee the wallet earns. The slider drives the live rebalancing panel below it.
- **Trade receipt** (Swap): after a real swap, a card with what you received (read from the trade's own event), what the other venue quoted for the same trade (0 wei apart), the transaction link, *Copy to share* and *Share on X*.
- **Fees and volume** (My index): fees earned per venue, fill by fill, and volume by venue. **Explore** cards show each index's fills, fees and a sparkline of its fill prices.
- **Docs** (`/docs`): quickstart, run the app, deploy to Base Sepolia, launch an index, quote both venues, trade (router, Uniswap v4 pool key, 1inch order), private reads, contracts with this build's addresses, tests and limits; every code block has a copy button.
- **Swap:** the everyday screen. Pay / receive, both venues' quotes side by side (identical, with each venue's remaining limit), rate, price impact, fee, minimum received (0.5% slippage), and one button that walks you through *get test tokens → approve → swap*. Defaults to the demo index so you trade against a real counterparty; makers can switch to their own.
- **Create:** assets and weights (always sum to 100%), quote preview per pair computed by the contracts' own math (`TenbinLens.previewSpot` / `previewOutGivenIn`).
- **Launch:** six real steps from your wallet (deploy your own hook with an address mined in the browser, test tokens, approve Aqua only, set weights, open v4 pools + ship the Uniswap venue, ship 1inch Aqua strategies). Each step resumes from chain state.
- **Explore:** every index launched through the factory (read from its events): value, weights, live/paused, with Trade and Live book links (`?index=0x…`).
- **My index** (the maker's home): performance vs just holding (start reconstructed from fills), fees earned, volume per venue; change allocation instantly or gradually (1 hour to 3 days) with the measured cost difference; pause both venues, resume, top up or re-split.
- **Live book:** weights vs target, a live rebalancing panel at the market prices you type (what the wallet will buy/sell, arbitrage available, "be that trader" → prefilled Swap), identical quotes on both venues per pair, remaining venue limits, one fill feed for both venues, fees earned, flush button.
- **Arbitrage me:** build any route across venues, quote it exactly, run it for real.
- **Privacy:** every chain read live (route, label, isolation key, latency), worker switcher (Tor / Nym / passthrough), who-learns-what, logging-proxy view.
- **Demo:** a guided six-step tour from your wallet, labelled demo mode (test tokens → approve → parity check → one trade per venue → losing loop). Real transactions; steps already done on chain are skipped; progress resumes after a reload.
- **Share:** a card for any index (`/share?index=0x…`): on-chain weights, spot prices, fill count, and a link to trade it.
- **Explanations:** every main screen has a collapsed "How this page works" box linking to its section of [docs/explained.md](docs/explained.md). Every page fits a phone (checked at 390 px). Text colours meet WCAG AA contrast in both themes, and the app is keyboard-navigable (skip link, visible focus).

## Sponsor technology used

### Uniswap v4

| Feature | Where |
|---|---|
| **Custom-curve hook** | `TenbinHook.beforeSwap` prices from the wallet and returns a delta that cancels the pool's own curve. The pool holds nothing. |
| **Hook permissions + CREATE2** | `TenbinHookFactory` deploys one hook per maker at an address with the right permission bits; the app mines the salt in the browser. |
| **ERC-6909 claims** | The trader's input is minted as claims held for the maker, priced in at once, and flushed into the wallet later via `Aqua.push`. |
| **Real v4 infrastructure** | The official PoolManager on Base Sepolia; the official **V4Quoter** returns exactly the hook's quote, and a real **Universal Router** swap pays from the wallet (fork tests). |
| **No liquidity deposits** | `beforeAddLiquidity` refuses LPs; only the maker can open pools, only for index tokens. |
| **Aggregator-hook pattern** | Like Uniswap's aggregator hooks, the hook routes a v4 swap to liquidity outside the pool (here, the maker's wallet via 1inch Aqua). |

### 1inch Aqua and SwapVM

| Feature | Where |
|---|---|
| **Custom SwapVM instruction** | `PortfolioPrice`, opcode `0xd0` (in the unallocated `0xd0–0xef` bank), prices 1inch fills through the same hook as Uniswap. |
| **Official router + one opcode** | `TenbinSwapVMRouter` is the official `AquaSwapVMRouter` with `_runOpcode` extended for `0xd0`; every stock opcode dispatches as upstream. |
| **Aqua shipping** | The wallet ships a strategy per pair; Aqua's virtual balances are the venue's selling limits. Dock to pause, re-ship at a new epoch to resume or top up. |
| **Maker hooks** | `postTransferIn` / `postTransferOut` clear the fill lock only after both transfers. |
| **A hook as an Aqua app** | The v4 hook ships its own strategy and calls `pull` / `push` inside the swap: one inventory, two venues. |

### Ethereum Foundation: Anon-RPC

| Feature | Where |
|---|---|
| **Only read path** | `web/src/lib/anon.ts` `rpc()`: one viem transport built on `@anon-rpc/browser-harness`; every chain read in the app goes through it. |
| **Isolation keys** | One per maker, one per pair (strategy), one per trader, plus `public`, so the RPC cannot link them. |
| **Tor → Nym** | Tor first; if it cannot bootstrap in 35 s, Nym (90 s). Never silently to a non-private route. |
| **Honest outage mode** | If both fail, a banner offers *Continue without privacy*; nothing is read until the user chooses, and each such read is logged `direct (not private)`. |
| **Proof on screen** | The Privacy page lists every read with route, isolation key and latency, and a *time per read* chart. |

## For judges: where to look in the code

| Track | What to read | Proof |
| --- | --- | --- |
| **Uniswap v4** (Build with Uniswap) | [TenbinHook.beforeSwap](https://github.com/Abhist17/tenbin/blob/main/contracts/src/TenbinHook.sol#L393): prices from the wallet, cancels the AMM with a return delta; [input minted as ERC-6909 claims](https://github.com/Abhist17/tenbin/blob/main/contracts/src/TenbinHook.sol#L415); [output paid via Aqua.pull into the PoolManager](https://github.com/Abhist17/tenbin/blob/main/contracts/src/TenbinHook.sol#L421); [claims flushed into the wallet via Aqua.push](https://github.com/Abhist17/tenbin/blob/main/contracts/src/TenbinHook.sol#L468); [no LP deposits](https://github.com/Abhist17/tenbin/blob/main/contracts/src/TenbinHook.sol#L385); [maker-only pools, index tokens only](https://github.com/Abhist17/tenbin/blob/main/contracts/src/TenbinHook.sol#L370) | [official V4Quoter == hook quote](https://github.com/Abhist17/tenbin/blob/main/contracts/test/fork/V4BaseSepolia.t.sol#L61) and [real Universal Router swap pays from the wallet](https://github.com/Abhist17/tenbin/blob/main/contracts/test/fork/V4BaseSepolia.t.sol#L72) on Base Sepolia; [`FEEDBACK.md`](FEEDBACK.md) |
| **1inch** (Build an Aqua App) | [PortfolioPrice.exec](https://github.com/Abhist17/tenbin/blob/main/contracts/src/aqua/PortfolioPrice.sol#L28) (custom SwapVM opcode `0xd0`, [Aqua virtual balance = venue limit](https://github.com/Abhist17/tenbin/blob/main/contracts/src/aqua/PortfolioPrice.sol#L42)); [TenbinSwapVMRouter._runOpcode](https://github.com/Abhist17/tenbin/blob/main/contracts/src/aqua/TenbinSwapVMRouter.sol#L16) (official AquaSwapVMRouter + one opcode); [the Aqua-shipped order](https://github.com/Abhist17/tenbin/blob/main/contracts/src/aqua/TenbinStrategy.sol#L22) | [venue limit](https://github.com/Abhist17/tenbin/blob/main/contracts/test/PortfolioPrice.t.sol#L48), [refuses another maker's hook](https://github.com/Abhist17/tenbin/blob/main/contracts/test/PortfolioPrice.t.sol#L57); real Aqua push/pull transfers in `test_swap_realPushPull_throughAqua` |
| **EF** (Best Use of Anon-RPC) | [rpc(): the app's only read path](https://github.com/Abhist17/tenbin/blob/main/web/src/lib/anon.ts#L280); [one viem client per isolation scope](https://github.com/Abhist17/tenbin/blob/main/web/src/lib/anon.ts#L341); [isolation keys: maker / strategy / trader / public](https://github.com/Abhist17/tenbin/blob/main/web/src/lib/anon.ts#L356); [the one bootstrap read, logged as such](https://github.com/Abhist17/tenbin/blob/main/web/src/lib/anon.ts#L81); [Tor -> Nym fallback, never to passthrough](https://github.com/Abhist17/tenbin/blob/main/web/src/lib/anon.ts#L107); [`proxy/server.mjs`](proxy/server.mjs) | Privacy screen: every read with route, label, isolation key and latency; "Test the route" reads Base Sepolia through the mixnet |
| **Shared math** | [outGivenIn](https://github.com/Abhist17/tenbin/blob/main/contracts/src/libraries/TenbinMath.sol#L130), [inGivenOut](https://github.com/Abhist17/tenbin/blob/main/contracts/src/libraries/TenbinMath.sol#L151), [spotPrice](https://github.com/Abhist17/tenbin/blob/main/contracts/src/libraries/TenbinMath.sol#L119), [bounded pow](https://github.com/Abhist17/tenbin/blob/main/contracts/src/libraries/TenbinMath.sol#L66) | [80-digit reference vectors](https://github.com/Abhist17/tenbin/blob/main/contracts/test/TenbinMath.t.sol#L50) |

## We attacked it ourselves

Our own review ([AUDIT.md](AUDIT.md)) found one **critical** bug and fixed it. SwapVM calls the taker back *after* pricing a fill and *before* moving coins; a trade nested in that gap priced on stale balances. The proof of concept: two honest buys lose **$39.54** in fees; with the second nested in the callback it **gained $752.92** from the maker. The fix is a fail-closed **fill lock** shared by both venues:

SwapVM calls the taker back *after* pricing and *before* moving coins. A trade nested in that gap would price on stale balances, so pricing is locked for the whole fill:

```mermaid
sequenceDiagram
    participant VM as 1inch fill
    participant H as TenbinHook
    participant U as Nested Uniswap trade
    VM->>H: quoteAndLock() sets the lock
    VM->>U: taker callback tries a second trade
    U->>H: quote()
    H-->>U: revert FillInProgress
    VM->>H: postTransferIn + postTransferOut clear the lock
```

Proof of concept: honest trades lose $39.54 in fees; the nested attack gained $752.92 before the fix and reverts after it. See [AUDIT.md](AUDIT.md).

| Attack | Result |
|---|---|
| A nested trade during a 1inch fill (C-1) | Reverts with `FillInProgress` |
| Clear the fill lock from outside the router | Refused |
| Point an order at someone else's hook | Refused: the instruction checks `pricer.maker() == order.maker` |
| Overdraw a venue | Stopped at the Aqua cap; the wallet keeps the rest |
| Donate tokens to move the price | Never profits (fuzzed) |
| Arbitrage loops on one venue or across both | Always lose (fuzzed, with a proven round-trip floor) |
| Remove a token while its claims are pending | Refused |

| Risk | Defence | Test |
| --- | --- | --- |
| Loops through the maker's pairs or across venues | Invariant math: every loop loses (fees only add to the wallet; rounding favours the maker), with a proven per-round-trip floor | [3-leg cross-venue loop](https://github.com/Abhist17/tenbin/blob/main/contracts/test/CrossVenue.t.sol#L57), [fuzzed loops over any venue mix](https://github.com/Abhist17/tenbin/blob/main/contracts/test/CrossVenue.t.sol#L79), [round-trip floor (fuzzed)](https://github.com/Abhist17/tenbin/blob/main/contracts/test/TenbinMath.t.sol#L93) |
| Inconsistent prices between venues | One `quote()` for both | [0 units difference, 6 directions × 2 modes](https://github.com/Abhist17/tenbin/blob/main/contracts/test/CrossVenue.t.sol#L15), [a fill moves the other venue](https://github.com/Abhist17/tenbin/blob/main/contracts/test/CrossVenue.t.sol#L40) |
| Donating tokens to move the price | Donations only enrich the maker | [donate-then-swap never profits (fuzzed)](https://github.com/Abhist17/tenbin/blob/main/contracts/test/TenbinMath.t.sol#L141) |
| Approval scope | The maker approves **only Aqua** (tighter than the original "Aqua and the hook" plan) | [no allowance to hook, router or PoolManager](https://github.com/Abhist17/tenbin/blob/main/contracts/test/CrossVenue.t.sol#L125) |
| Venue over-draw | Aqua virtual balances cap each venue; hook checks its own cap | [Uniswap venue stops at its cap](https://github.com/Abhist17/tenbin/blob/main/contracts/test/TenbinHook.t.sol#L71), [1inch venue stops at its cap](https://github.com/Abhist17/tenbin/blob/main/contracts/test/PortfolioPrice.t.sol#L48) |
| Someone points an order at your hook | Instruction checks `pricer.maker() == order.maker` | [refused](https://github.com/Abhist17/tenbin/blob/main/contracts/test/PortfolioPrice.t.sol#L57) |
| Rounding | Every step rounds toward the maker | [maker-side vs 80-digit reference](https://github.com/Abhist17/tenbin/blob/main/contracts/test/TenbinMath.t.sol#L50) |
| Unrelated funds in the wallet | Use a dedicated maker wallet (stated in the app) | documented |
| RPC metadata leaks | All reads through Anon-RPC; bootstrap read and transactions documented as exceptions | Privacy screen |

## Tests

```bash
cd contracts
npm install                                  # @1inch/solidity-utils, @openzeppelin (as upstream does)
git submodule update --init --recursive
npm run build:v4                             # builds the real v4 PoolManager artifact (solc 0.8.26)
forge test --no-match-path 'test/fork/*'     # 57 tests (incl. invariant suite, audit PoC, gas)
forge test --match-path 'test/fork/*'        # 2 fork tests against live Uniswap v4 on Base Sepolia
python3 reference/tenbin_math.py              # regenerates the 80-digit reference vectors
```

| Suite | Covers |
| --- | --- |
| `TenbinMath.t.sol` | 111 vectors from an 80-digit Python reference (within 3×10⁻¹⁴ of balance, always on the maker's side); fuzzed round-trip floor; fee-free invariant never decreases; donation-then-swap never profits; guards. |
| `TenbinHook.t.sol` | Pays from wallet, prices from wallet, exact-out, claims flush via Aqua (re-crediting the venue limit), permissionless flush, a token cannot leave the index with claims pending, venue limit stops at the Aqua cap while the wallet keeps the rest, no LP, maker-only pools, scoped approvals. |
| `PortfolioPrice.t.sol` | Program layout, quote == hook quote, real Aqua push/pull, exact-out, venue limit = Aqua virtual balance, refuses another maker's hook. |
| `CrossVenue.t.sol` | Same price (6 directions × 2 modes), fills move the other venue, loops lose (fixed + fuzzed), self-rebalancing, only Aqua is approved. |
| `Reweight.t.sol` | Weights glide linearly and both venues follow; gradual vs instant re-weight cost with a fee-aware arbitrageur. |
| `Manage.t.sol` | Pause stops both venues (wallet untouched); resume with a top-up under a new epoch; epoch 0 orders unchanged. |
| `invariant/TenbinInvariant.t.sol` | 64 runs × 40 random actions (swaps on both venues, exact-in/out, flushes, donations): same price both venues, wallet changes only by fills, claims fully backed, invariant never falls, only Aqua approved. |
| `audit/CrossVenueReentrancy.t.sol`, `audit/FillLock.t.sol` | Audit finding C-1: the callback double-dip PoC (now blocked) and the fill-lock guarantees. See [AUDIT.md](AUDIT.md). |
| `LensLoop.t.sol` | A cross-venue loop returns exactly its Lens quote leg by leg; quoteBoth; book; minOut. |
| `fork/V4BaseSepolia.t.sol` | Official V4Quoter == hook quote; a real Universal Router swap pays from the maker wallet. |
| `Gas.t.sol` | What each action costs, with regression bounds: Uniswap v4 swap ~290k gas (incl. the test router), 1inch Aqua fill ~216k, flush ~143k, `quote()` ~52k (measured in-test, before refunds, excluding the 21k base). |

**Everything in one command:** `./scripts/check-all.sh` runs the contract tests (including fork tests), the web typecheck and lint, a fresh fork with deploy, the 36 smoke checks, 27 headless user flows and the 18 browser specs (about 10 minutes). CI runs the offline contract suite and the web checks on every push.

**Browser tests** (Playwright, system Chrome, no browser download). `cd web && npm run e2e` boots a fresh Base Sepolia fork, deploys, and drives the real app with an injected wallet backed by anvil's dev accounts:

| Spec | Proves |
| --- | --- |
| `01-landing` | The hook sentence, the live price board (both venues equal, 0 wei), the shop story, the receipts, no console errors |
| `02-create` | Weights always sum to 100%; preview equals the contracts' math |
| `03-launch` | Six real launch transactions; a reload mid-launch resumes from chain state |
| `04-book` | Identical quotes per pair; a fill on one venue moves the other; flush; venue limits |
| `05-arbitrage` | A 3-leg cross-venue loop returns exactly its quote, and loses |
| `06-privacy` | Every read listed with route and isolation key |
| `07-screens` | Swap, Explore, My index, How it works, light and dark |
| `08-demo` | Guided demo runs for real, resumes after reload, reruns without duplicates |
| `09-manage` | Gradual re-weight glides on chain time; top up raises a venue limit |
| `10-share` | Share card shows on-chain data; links keep the picked index |
| `11-mobile` | All 12 pages fit a 390 px phone; both menus work |
| `12-explain` | Every main page's "How this page works" box opens and links to the explainer |
| `13-a11y` | Skip link is the first tab stop; keyboard focus is visible; the nav marks the current page; every image has alt text |
| `14-gas` | A wallet with no ETH is told how to get gas (faucet links on Base Sepolia) on Demo, Swap and Launch; a funded wallet never sees it |
| `15-wallet` | Switching accounts in the browser wallet updates the app; disconnecting there disconnects here |
| `16-docs` | Docs render, code blocks copy, this build's contract addresses show, every section link resolves |
| `17-charts` | Charts tell the truth: Uniswap and 1inch identical at every trade size, every loop size loses, hold vs Tenbin, read latency |
| `18-features` | Move the market (traders act, the wallet earns a fee), a real swap ends with a receipt 0 wei apart from the other venue, fees and volume per venue, Explore sparklines |

`npm run e2e:testnet` checks the deployed site instead: reads really go through Anon-RPC (Tor, falling back to Nym) to Base Sepolia, and every chain screen either works or (before the contracts are deployed) explains itself with a labelled screenshot. Screenshots land in `web/e2e/artifacts/`.

**On the live site**, `npm run e2e:testnet` checks that reads really go through Anon-RPC to Base Sepolia, that the live Book quotes both venues identically, that every page loads with no errors, broken images or broken links, and (with Tor and Nym blocked on purpose) that nothing is read until the user chooses the direct route.

## Screens

| Home · the hook and the live price board | Demo · six real steps, three proofs |
|---|---|
| <img src="docs/media/landing.jpg" alt="Home page with the live price board"> | <img src="docs/media/demo.jpg" alt="Demo page with the three green proof tiles: 0 wei, Exact, -0.8%"> |
| **Book · same price at every size** | **Book · move the market** |
| <img src="docs/media/book-size.jpg" alt="Chart: the 1inch line runs exactly along the Uniswap band at every trade size"> | <img src="docs/media/move-market.jpg" alt="Slider and chart: ETH share if nobody trades vs after traders rebalance"> |
| **Book · depth and every fill** | **My index · fees and volume by venue** |
| <img src="docs/media/market-charts.jpg" alt="Depth read from the wallet and ETH price fill by fill"> | <img src="docs/media/fees-volume.jpg" alt="Fees earned per venue and volume by venue"> |
| **Swap · trade receipt** | **Privacy · every read, through Anon-RPC** |
| <img src="docs/media/receipt.jpg" alt="Receipt: filled on Uniswap, 1inch quoted exactly the same, 0 wei apart"> | <img src="docs/media/privacy.jpg" alt="Privacy page on the live site: 100% private reads through the Nym mixnet"> |
| **Explore · every index** | **Docs · build on Tenbin** |
| <img src="docs/media/explore.jpg" alt="Explore cards with fills, fees and a sparkline"> | <img src="docs/media/docs.jpg" alt="Developer docs page"> |

## Deployments: live on Base Sepolia

**App:** https://abhist17.github.io/tenbin/ · every read goes through Anon-RPC · the demo index has real fills on both venues · 36/36 on-chain checks (`./scripts/smoke.sh base-sepolia`).

| Contract | Address | What it is |
| --- | --- | --- |
| Demo index (TenbinHook) | [`0xb6879F5F560597B7C1dbfA176c4ac6928Eac6888`](https://sepolia.basescan.org/address/0xb6879F5F560597B7C1dbfA176c4ac6928Eac6888) | the live 40/30/30 index: trade it on either venue |
| TenbinHookFactory | [`0x2F4578C47671b7147908BB9A46a6F8E48c51B18D`](https://sepolia.basescan.org/address/0x2F4578C47671b7147908BB9A46a6F8E48c51B18D) | one hook per maker |
| TenbinSwapVMRouter | [`0x758fFD698fF6A7662ad3094eF3d644f436F1db93`](https://sepolia.basescan.org/address/0x758fFD698fF6A7662ad3094eF3d644f436F1db93) | 1inch AquaSwapVMRouter + opcode 0xd0 |
| Aqua | [`0x78999A40d392C402b743b810De4c5DbFdD370239`](https://sepolia.basescan.org/address/0x78999A40d392C402b743b810De4c5DbFdD370239) | 1inch Aqua (official source, redeployed: not on testnets) |
| TenbinLens | [`0xe0410dAE32b3cA5f966B13FC6Ee4D8c274F9ca5b`](https://sepolia.basescan.org/address/0xe0410dAE32b3cA5f966B13FC6Ee4D8c274F9ca5b) | whole book, quotes on both venues, previews |
| TenbinLoopRouter | [`0xcA34ABc7f1D6b488cecf3Af6d5E57434cF671b25`](https://sepolia.basescan.org/address/0xcA34ABc7f1D6b488cecf3Af6d5E57434cF671b25) | multi-leg trades across both venues |
| PoolManager | [`0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408`](https://sepolia.basescan.org/address/0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408) | official Uniswap v4 |
| Test tokens | [tWETH](https://sepolia.basescan.org/address/0xc0a02AdD604782C723D170d87aE8bFC478ce53D2) · [tWBTC](https://sepolia.basescan.org/address/0x44F7330F03c46aa75135E757DB320370208fdcCC) · [tUSDC](https://sepolia.basescan.org/address/0xc931D7EA4a7102E3F16173b077A4c26671Dab54d) | tWETH / tWBTC / tUSDC (no value) |

## Run it

**One command:** `./scripts/demo.sh` forks Base Sepolia, deploys, launches 40/30/30, runs fills on both venues, prints the on-chain numbers and opens the app. In the app, **Demo** in the nav runs the same story from your wallet. See [docs/demo.md](docs/demo.md).

**Local fork, step by step (everything, including the UI):**

```bash
anvil --fork-url https://sepolia.base.org --chain-id 31337
cd contracts
K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil dev keys
K1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
K2=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
forge script script/DeployTenbin.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key $K0
forge script script/LaunchIndex.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key $K1
forge script script/DemoTrades.s.sol  --rpc-url http://127.0.0.1:8545 --broadcast --private-key $K2
cd ../web && npm install && npm run sync && npm run dev   # http://localhost:3000, Connect → Local dev accounts
```

**Base Sepolia:**

```bash
./scripts/setup-deployer.sh                       # fresh testnet wallet, encrypted (or: cast wallet import tenbin-deployer --interactive)
# fund the printed address with >= 0.005 Base Sepolia ETH (the deploy uses ~0.0002)
./scripts/deploy-base-sepolia.sh                  # deploy, launch demo index, demo fills, smoke test, push (rehearsed on a fork: 36/36)
cd web && NEXT_PUBLIC_TENBIN_NETWORK=base-sepolia npm run dev   # every read through Anon-RPC
# optional: UPSTREAM=https://sepolia.base.org node proxy/server.mjs, expose it, set NEXT_PUBLIC_TENBIN_PROXY_URL
```

### Build, test and ship

```mermaid
flowchart LR
    C["contracts/<br/>Foundry, via-IR"] --> FT["forge test<br/>59: unit · fuzz · invariants<br/>audit PoC · gas · fork"]
    W["web/<br/>Next.js 15 + viem"] --> E2E["Playwright<br/>every screen on a fresh fork"]
    C --> D["scripts/demo.sh<br/>fork, deploy, trade, print"]
    FT --> CI["GitHub Actions: Tests"]
    E2E --> CA["scripts/check-all.sh<br/>everything, ~10 min"]
    C --> DEP["scripts/deploy-base-sepolia.sh<br/>deploy, launch, trade, 36 checks"]
    DEP --> BS[("Base Sepolia")]
    DEP --> SYNC["npm run sync<br/>ABIs + addresses"] --> PAGES["GitHub Actions: Pages<br/>static export"]
    PAGES --> SITE["abhist17.github.io/tenbin"]
    SITE -- "reads via Anon-RPC" --> BS
```

## Questions we set out to answer

- **Can a contract other than the SwapVM router (our v4 hook) act as an AquaApp and `pull`/`push`?** Yes. Aqua keys balances by `msg.sender` as the app, so the hook ships its own strategy and pulls/pushes inside the v4 swap. No direct-approval fallback was needed.
- **Can a custom SwapVM instruction use the maker's real balances?** Yes: opcode `0xd0` calls the hook's `quote()`, which reads the wallet's ERC-20 balances plus pending claims; SwapVM's preloaded Aqua balances become the venue cap.
- **Does the Universal Router / quoter work with a custom-curve hook pool?** Yes, unchanged: the fork tests use the live V4Quoter and Universal Router on Base Sepolia.
- **Which Anon-RPC network reaches our testnet?** Nym did (Base Sepolia reads in ~6 s, 6 Nov 2026). The EF demo Tor gateway was unreachable that day, so the app falls back from Tor to Nym automatically.

## Prior art

| Area | Closest prior work | Tenbin |
| --- | --- | --- |
| Aqua apps | ScubaSwap, Batas, Plimsoll, AquaPilot / Sluice, KSwap-VM, Aqua0 | None prices from shared portfolio balances or links Aqua to Uniswap v4 |
| v4 hooks sourcing outside liquidity | Uniswap's aggregator hooks; Iceberg (ETHGlobal Tokyo 2026: v4 hook + Aqua at one price) | A self-custodial multi-token index that self-rebalances through trader flow, with private monitoring; no LVR claim |
| Weighted pools | Balancer | Same math, but self-custodial, multi-venue and wallet-native |

## Honest limits

- Tenbin does not reduce LVR against the outside market; it earns the fee on the trades that rebalance it.
- A round trip doesn't always lose a full fee: part of the first leg's fee is won back by the return leg. Every loop still loses.
- Uniswap input waits as claims until the next swap or a flush. It is priced in immediately, but 1inch can only sell what is in the wallet as ERC-20.
- Venue limits shrink as a venue sells (Uniswap's grows back as its input is flushed via `Aqua.push`). Raising them is one click on My index (**Top up / re-split**), but under the hood it is a new epoch: venues are docked, then re-shipped at `venueNonce + 1`, so open 1inch orders from the old epoch stop filling.
- One trade can move at most 30% of a balance (keeps the fixed-point `pow` accurate).
- Use a dedicated maker wallet: prices read the wallet's live balances, so spending index tokens elsewhere moves the quotes (and gifting tokens to it only enriches the maker).
- Testnet demo with test tokens. Not externally audited; our own review ([AUDIT.md](AUDIT.md)) found and fixed one critical bug.

## Repository

```
contracts/                Foundry project (Solidity 0.8.30, via-IR)
  src/TenbinHook.sol      Uniswap v4 custom-curve hook: quote, fill lock, claims, flush, weights, venue epochs
  src/TenbinHookFactory.sol   CREATE2 factory, one hook per maker
  src/aqua/               PortfolioPrice (opcode 0xd0), TenbinSwapVMRouter, TenbinStrategy
  src/libraries/          TenbinMath (weighted-pool math), LogExpMath, TenbinPools, HookMiner
  src/TenbinLens.sol      read helper: book, quoteBoth, quoteRoute, previews
  src/TenbinLoopRouter.sol    multi-leg trades across both venues
  test/                   unit, fuzz, invariant, audit PoC, gas and Base Sepolia fork tests (59)
  script/                 DeployTenbin, LaunchIndex, DemoTrades
  reference/              80-digit Python reference for the math
web/                      Next.js 15 app (static export to GitHub Pages)
  src/app/                Home, Swap, Explore, Book, My index, Create, Launch, Arbitrage, Privacy, How, Demo, Share, Docs
  src/lib/anon.ts         the Anon-RPC read path
  src/components/         charts (plain SVG), price board, receipt, move-the-market, explainers
  e2e/                    Playwright browser suite and the live-site checks
proxy/                    logging JSON-RPC proxy (shows reads arriving from anonymity-network exits)
scripts/                  demo.sh, check-all.sh, setup-deployer.sh, deploy-base-sepolia.sh, smoke.sh, fork-up.sh
docs/                     explained.md (start here), Anon-RPC notes, PortfolioPrice write-up, demo, submission pack
AUDIT.md · FEEDBACK.md    our security review · Uniswap v4 developer feedback
```

## Roadmap

- **Mainnet, after an external audit.** The contracts are testnet-only today.
- **Listed as an aggregator hook.** Uniswap's aggregator hooks route outside liquidity through v4; Tenbin already has that shape (a v4 pool backed by a wallet via Aqua), so its liquidity could be routed by Uniswap's own router and web app.
- **More assets and indexes.** Any number of tokens and weights per index, and index templates (ETH/BTC, stablecoin baskets).
- **Private writes.** Send transactions through Anon-RPC too, not only reads.
- **Raise limits without a new epoch.** Top up a venue's Aqua limit in place instead of docking and re-shipping.

## License

MIT (see [LICENSE](LICENSE)). Third-party code keeps its own license; `TenbinSwapVMRouter` extends 1inch's AquaSwapVMRouter and is subject to the SwapVM license for that part.
