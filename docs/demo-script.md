# 3-minute demo

1. **0:00–0:20 Landing:** one wallet, two markets, one price; the same live price on both counters.
2. **0:20–0:45 One stockroom, two stalls:** both venues read the same stacks; open the live book, quotes identical (Δ 0).
3. **0:45–1:15** A trader sells ETH on Uniswap; the fill appears in the feed and the 1inch quote moved too.
4. **1:15–1:50 Arbitrage me:** ETH → USDC on Uniswap, USDC → BTC on 1inch, BTC → ETH on Uniswap; quoted, run, loses ~0.89% and returns exactly its quote.
5. **1:50–2:20 Drag the market:** ETH jumps, traders rebalance it to 40/30/30; honest line on LVR.
6. **2:20–2:50 Privacy:** every read through Anon-RPC over Tor, one key per strategy; the proxy log shows Tor exits.
7. **2:50–3:00 Close:** "One wallet, one price, every venue, nobody watching."
