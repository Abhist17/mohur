# Open decisions (Phases 3–5)

Nothing in this file is implemented yet. Each section ends at a decision point.

## Phase 3: add-ons, ranked

| # | Add-on | Value to users and judges | Effort | Risk |
|---|---|---|---|---|
| **1** | **Gradual weights in the UI** *(update: already built on My index; now covered by e2e `09-manage`)* | Already on chain (`scheduleWeights`; tests show a 50-step glide costs $25 vs $1,991 for an instant switch). It only needs a "Change weights over N hours" form on My index plus a progress bar. It is the most distinctive thing Mohur does that a plain AMM cannot. | S (2–3 h) | Low: the contract is tested |
| **2** | **Top up 1inch limits without reshipping** *(update: already built as "Top up / re-split", which re-ships at a new epoch; now covered by e2e `09-manage`)* | Today venue limits are fixed at launch (a stated limitation). Calling `Aqua.ship` again for the same strategy hash is not allowed, but a maker can re-ship under `venueNonce+1`, which the app already does for pause/resume. A "Raise 1inch limit" button that docks and re-ships at the new nonce in one flow removes the limitation for users. | M (3–4 h) | Medium: needs a fork test for dock → reship with live fills in between |
| **3** | **Shareable index card page** | `/i/<hook>` with weights, price, fills and a "trade this index" link, plus a static OG image. It helps people share an index and costs nothing on chain. | S (2 h) | Low. Note: the static GitHub Pages export cannot render per-index OG images, so the card would be client-rendered. |
| 4 | Uniswap Trading API routing | Lets the Swap page compare Mohur's quote with the rest of Uniswap. The Trading API does not cover Base Sepolia test tokens, so on testnet it would always show "no route". A good pitch line, but weak in a demo. | M | High: needs an API key and mainnet |
| 5 | Anon-RPC depth | Per-scope isolation is already done (maker / strategy / trader / public). The next step would be routing writes (tx broadcast) through Anon-RPC as well. That's useful, but the EF Tor gateway is down today, so it can only be shown via Nym (~50 s per read). | M | High: depends on infrastructure we don't control |
| 6 | Mobile pass | The layout already works at phone width (burger nav). A full pass would cover the Swap card, the Book table and the 3D scene on small screens. | S | Low |

**Recommendation: build 1, 2 and 3 in that order.**

⏸ **DECISION: pick which add-ons to build.**

## Phase 4: name

"Mohur" is a Mughal-era gold coin. Japanese alternatives in the same spirit (money, storehouse, balance):

| Name | Meaning | Why it fits |
|---|---|---|
| Koban (小判) | Edo-period oval gold coin | Closest analogue to "mohur" |
| Ryō (両) | Edo gold unit | Short, four letters |
| Kura (蔵) | Storehouse | One wallet that holds the whole stock |
| Tenbin (天秤) | Balance scale | Weighted balance; also used by Edo money changers |
| Hakari (秤) | Scale / weigh | Weights at the core |
| Masu (枡) | Wooden measuring box | Fixed proportions |
| Wa (和) | Harmony; also "sum" | One price everywhere |
| Kinko (金庫) | Safe / vault | Self-custody |
| Ichiba (市場) | Marketplace | Many venues, one book |
| Sanpō (三方) | Three sides | Three-asset index; "sanpō yoshi" means good for all three parties |
| **Keep Mohur** | | Already in the repo, contracts, docs and screenshots; no rename risk |

**Recommendation: keep Mohur for the hackathon.** If you rename, Tenbin tells the weighted-balance story best. A rename would touch the UI, docs and README, but not the deployed contract names.

⏸ **DECISION: pick a name or keep Mohur.**

## Phase 5: UI audit and directions

**What works:**
- One font (Geist).
- Light and dark themes.
- Muted gold accent.
- Short copy.
- Venue logos.
- Every screen covered by e2e screenshots.

**Issues found:**
- Numbers are not consistently tabular; columns shift on the Book and Swap pages.
- Raw 18-decimal amounts still appear in a few places, such as the Book's pending column.
- Spacing and radius values are inline in several pages instead of tokens.
- Nav has eight items at desktop width and gets crowded near 1100 px.
- The Ethereum Foundation / Anon-RPC mark is text only; there is no logo.

**Three directions:**

1. **Ledger** (calm, financial). Off-white paper, ink black, gold for only one action per screen, tabular mono numbers, hairline tables. Closest to the current look and the least work.
2. **Vault** (dark first, premium). Near-black surfaces, warm gold gradients on the coin and primary actions, larger numbers, the 3D stacks scene as the hero on every key page.
3. **Exchange** (dense, pro). Uniswap/1inch-style compact cards, side-by-side venue quotes always visible, a live fill ticker; more information, less story.

**Recommendation: Ledger** plus the fixes above:
- Spacing, radius and type-scale tokens.
- `font-variant-numeric: tabular-nums` on every number.
- A shared amount formatter.
- Uniswap, 1inch and Ethereum Foundation marks in the "Built on" footer and on the Privacy page.

⏸ **DECISION: pick a direction.**
