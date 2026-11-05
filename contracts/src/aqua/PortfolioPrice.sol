// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Context } from "@1inch/swap-vm/contracts/libs/VM.sol";
import { IMohurPricer } from "../interfaces/IMohurPricer.sol";

/// @title PortfolioPrice (SwapVM opcode 0xd0)
/// @notice Custom SwapVM instruction: prices a 1inch Aqua fill from the maker wallet's *real* balances by
///         calling the same `quote()` the Uniswap v4 hook uses.
///
///         SwapVM pre-loads the Aqua virtual balances of this strategy into ctx.swap.balanceIn/balanceOut.
///         We keep those as *this venue's selling limit* (amountOut <= balanceOut) and ignore them for pricing.
///
///         args (20 bytes): the MohurHook / IMohurPricer address. It is part of the maker's own (Aqua-shipped)
///         program, so a taker cannot substitute another pricer.
library PortfolioPrice {
    uint8 internal constant OPCODE = 0xd0;

    error PortfolioPriceBadArgs();
    error PortfolioPriceWrongMaker(address pricerMaker, address orderMaker);
    error PortfolioPriceVenueLimit(uint256 amountOut, uint256 aquaBalanceOut);

    /// @notice Encoded instruction: [0xd0][0x14][pricer].
    function build(address pricer) internal pure returns (bytes memory) {
        return abi.encodePacked(OPCODE, uint8(20), pricer);
    }

    function exec(Context memory ctx, bytes calldata args) internal {
        if (args.length != 20) revert PortfolioPriceBadArgs();
        IMohurPricer pricer = IMohurPricer(address(bytes20(args)));
        address pricerMaker = pricer.maker();
        if (pricerMaker != ctx.query.maker) revert PortfolioPriceWrongMaker(pricerMaker, ctx.query.maker);

        bool exactIn = ctx.query.isExactIn;
        uint256 amount = exactIn ? ctx.swap.amountIn : ctx.swap.amountOut;
        // A real fill (not SwapVM.quote) also locks the pricer until the coins have moved: SwapVM calls taker
        // callbacks between pricing and transfers, and nothing may trade against stale balances in that window.
        (uint256 amountIn, uint256 amountOut) = ctx.vm.isStaticContext
            ? pricer.quote(ctx.query.tokenIn, ctx.query.tokenOut, amount, exactIn)
            : pricer.quoteAndLock(ctx.query.tokenIn, ctx.query.tokenOut, amount, exactIn);
        // Aqua's virtual balance for this strategy = what this venue may still sell.
        if (amountOut > ctx.swap.balanceOut) revert PortfolioPriceVenueLimit(amountOut, ctx.swap.balanceOut);

        ctx.swap.amountIn = amountIn;
        ctx.swap.amountOut = amountOut;
    }
}
