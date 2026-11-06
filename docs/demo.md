# One-click demo

```bash
./scripts/demo.sh        # or: cd web && npm run demo
```

Needs Foundry and Node. Takes about 2–4 minutes, mostly forking Base Sepolia and compiling.

| Step | What happens | What it shows |
|---|---|---|
| 1 | Forks Base Sepolia locally (real Uniswap v4 PoolManager), deploys Mohur, launches a 40/30/30 ETH/BTC/USDC index, runs 4 scripted fills (2 on Uniswap v4, 2 on 1inch Aqua) | Everything runs against real v4 contracts |
| 2 | Reads weights and balances from the hook | One wallet, three tokens, target weights |
| 3 | Quotes the same trade on both venues in one call (`MohurLens.quoteBoth`) | **0 wei difference** between Uniswap and 1inch |
| 4 | Quotes a 3-leg loop ETH→USDC→BTC→ETH across both venues (`MohurLens.quoteRoute`) | The loop **loses about 0.8%**, so there's no arbitrage |
| 5 | Counts `Fill` (hook) and `Swapped` (SwapVM) events | The fills are real transactions on chain |

Then it starts the app on `http://localhost:3000` (local-fork mode) and opens the Live book for the demo index. To trade, connect **Dev #2 (trader)**.

Options: `NO_APP=1` prints the numbers only. `SKIP_FORK=1` re-reads the numbers from an existing fork without redeploying.

Every number is read from the contracts on the fork; nothing is computed or simulated in JavaScript.
On a local fork, reads go directly to the node. On Base Sepolia, the app sends every read through Anon-RPC (see the Privacy page).
