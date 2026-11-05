# Mohur

**One wallet, one price, every venue, nobody watching.**

Mohur turns a self-custodial wallet into a weighted index (e.g. 40% ETH / 30% BTC / 30% USDC) that
**Uniswap v4** and **1inch Aqua** trade against at the same time, from the same coins, at the same
price, with no oracle. Every chain read the dashboard makes goes through the Ethereum Foundation's
**Anon-RPC**.

> Built from scratch at ETHGlobal (hack day: 5 Nov 2026). Work in progress — see commit history.

## Layout

| Folder | Contents |
| --- | --- |
| `contracts/` | Foundry project: MohurMath, MohurHook (Uniswap v4), PortfolioPrice (1inch SwapVM opcode `0xd0`) |
| `web/` | Next.js dashboard (Anon-RPC transport) |
| `proxy/` | Logging JSON-RPC proxy |
| `docs/` | Design notes |
