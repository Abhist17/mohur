# PortfolioPrice: SwapVM opcode 0xd0

`PortfolioPrice` is a custom 1inch SwapVM instruction that makes an Aqua strategy quote from the maker
wallet's **real** balances, through the same function Mohur's Uniswap v4 hook uses.

## Encoding

```
[0xd0][0x14][pricer: 20 bytes]          # pricer = the maker's MohurHook (IMohurPricer)
```

A Mohur strategy program is `[Salt (0x02, optional)] ++ [PortfolioPrice(hook)]`. The order uses
`useAquaInsteadOfSignature`, so the Aqua strategy bytes are `abi.encode(order)` and the strategy hash is the
order hash.

## Semantics

SwapVM pre-loads this strategy's Aqua virtual balances into `ctx.swap.balanceIn / balanceOut`. The
instruction:

1. checks `pricer.maker() == ctx.query.maker`: an order cannot point at someone else's wallet;
2. calls `pricer.quote(tokenIn, tokenOut, amount, isExactIn)`, which runs MohurMath over the wallet's
   ERC-20 balances plus Uniswap input still held as claims;
3. requires `amountOut <= ctx.swap.balanceOut`, so **Aqua's virtual balance is this venue's selling limit**;
4. writes `amountIn` / `amountOut`.

Settlement is stock Aqua: with `useTransferFromAndAquaPush`, the router takes the taker's input and
`Aqua.push`-es it to the maker, then `Aqua.pull`-s the output from the wallet to the taker.

## Why a shared `quote()` on the hook

Putting MohurMath inside the router pushes it over the 24 KB limit. Calling the hook keeps the router at
22.7 KB and makes "same price on both venues" true by construction: there is literally one function.

## Router

`MohurSwapVMRouter` is the official `AquaSwapVMRouter` with `_runOpcode` overridden for one opcode in the
unallocated `0xd0–0xef` bank; every stock opcode dispatches exactly as upstream.
