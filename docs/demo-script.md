# 3-minute demo video

## Before recording

1. Run `./scripts/demo.sh`. It forks Base Sepolia, deploys, launches the demo index, prints the numbers and opens the app on `localhost:3000`. Reads on a local fork are instant, which keeps the video tight.
2. In a second tab, open the live site's **Privacy** page (Base Sepolia) and press **Test the route** a minute ahead. Tor is down today, so it falls back to Nym, and a read takes ~50 s. Let it finish before you record that part.
3. In the app, connect **Dev #2 (trader)**. Set the theme you want and zoom the browser to 110%.

## Script

| Time | Screen | Show | Say |
|---|---|---|---|
| 0:00–0:15 | Home | The 3D coin stacks feeding two counters | "Mohur turns one wallet into an index (40% ETH, 30% BTC, 30% USDC) that Uniswap and 1inch both trade against, at one price." |
| 0:15–0:45 | **Demo** | Press **Run the demo**; step 3 shows *difference 0 wei*; steps 4 and 5 trade 100 USDC on each venue | "Same trade, both venues: zero wei apart, because both call one pricing function over the wallet's real balances. No oracle, nothing to sync." |
| 0:45–1:10 | Demo → Book | Step 6 shows the loop losing; open the Book: both fills in one feed, quotes still equal | "Try to arbitrage across both venues: the loop loses. A fill on one venue moves the other venue's price instantly." |
| 1:10–1:35 | Book | Type ETH $5,000: "opportunity open", what the wallet will buy and sell | "When the market moves, traders rebalance the wallet back to 40/30/30 and pay it the fee. That's the index managing itself." |
| 1:35–2:00 | My index | Change to 50/25/25 **over 1 hour**; the glide tag appears | "Changing the mix slowly costs $25 instead of $1,991 in our tests: the market walks you there." |
| 2:00–2:30 | Privacy (live site) | The finished route test: Tor failed, Nym answered, 100% private reads, isolation keys | "Every read goes through the Ethereum Foundation's Anon-RPC, with a separate key per maker, pair and trader, so the RPC can't link them." |
| 2:30–2:50 | Share / Explore | A shared index card; **How this page works** opened | "Anyone can share an index and trade it. Every screen explains itself." |
| 2:50–3:00 | Close | Home | "One wallet, one price, every venue, nobody watching. Testnet; our own audit found and fixed one critical bug. Details in the README." |

## If something goes wrong

- **A trade toast says "reverted":** the fork was restarted. Rerun `./scripts/demo.sh`, then use **Start over** on the Demo page.
- **Privacy route test hangs:** switch the worker to **nym** on the Privacy page and test again.
- **No 3D scene:** use Chrome or Edge with hardware acceleration on.
