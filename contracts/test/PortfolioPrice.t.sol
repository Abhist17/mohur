// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ISwapVM } from "@1inch/swap-vm/contracts/interfaces/ISwapVM.sol";
import { UnisonStrategy } from "../src/aqua/UnisonStrategy.sol";
import { PortfolioPrice } from "../src/aqua/PortfolioPrice.sol";
import { UnisonFixture } from "./utils/UnisonFixture.sol";

contract PortfolioPriceTest is UnisonFixture {
    function setUp() public {
        setUpUnison();
    }

    function test_program_isSaltThenPortfolioPrice() public view {
        bytes memory p = UnisonStrategy.program(address(hook), 7);
        assertEq(p.length, 10 + 22);
        assertEq(uint8(p[0]), 0x02); // stock Salt
        assertEq(uint8(p[10]), 0xd0); // PortfolioPrice
        assertEq(uint8(p[11]), 20);
        assertEq(UnisonStrategy.program(address(hook), 0), PortfolioPrice.build(address(hook)));
    }

    function test_quote_equalsHookQuote() public {
        (, uint256 hookOut) = hook.quote(address(wbtc), address(usdc), 0.01e8, true);
        (, uint256 aquaOut) = quoteAqua(address(wbtc), address(usdc), 0.01e8, true);
        assertEq(aquaOut, hookOut);
    }

    function test_swap_realPushPull_throughAqua() public {
        uint256 makerWethBefore = weth.balanceOf(maker);
        uint256 makerUsdcBefore = usdc.balanceOf(maker);
        (uint256 amountIn, uint256 amountOut) = swapAqua(trader, address(usdc), address(weth), 4_000e6, true);
        assertEq(amountIn, 4_000e6);
        // input pushed straight into the wallet (ERC-20), output pulled straight out of it
        assertEq(usdc.balanceOf(maker), makerUsdcBefore + amountIn);
        assertEq(weth.balanceOf(maker), makerWethBefore - amountOut);
        assertGt(amountOut, 0.85e18); // $4k is ~13% of the USDC balance -> price impact
        assertLt(amountOut, 0.997e18);
    }

    function test_exactOut() public {
        (uint256 qIn,) = hook.quote(address(weth), address(wbtc), 0.001e8, false);
        (uint256 amountIn, uint256 amountOut) = swapAqua(trader, address(weth), address(wbtc), 0.001e8, false);
        assertEq(amountOut, 0.001e8);
        assertEq(amountIn, qIn);
    }

    function test_venueLimit_isAquaVirtualBalance() public {
        // the WETH/USDC strategy may sell 25% of the USDC (7,500); a trade above that is refused even though
        // the wallet (30,000 USDC) and the 30% trade bound (9,000) would allow it.
        (, uint256 hookOut) = hook.quote(address(weth), address(usdc), 2.6e18, true);
        assertGt(hookOut, 7_500e6);
        vm.expectRevert(); // PortfolioPriceVenueLimit
        quoteAqua(address(weth), address(usdc), 2.6e18, true);
    }

    function test_revert_pricerOfAnotherMaker() public {
        address mallory = makeAddr("mallory");
        // mallory ships an order that points at *our* maker's hook - the instruction refuses it
        ISwapVM.Order memory o = UnisonStrategy.order(mallory, address(hook), address(weth), address(usdc), 0);
        (address t0, address t1) = _sort(address(weth), address(usdc));
        address[] memory ts = new address[](2);
        ts[0] = t0;
        ts[1] = t1;
        uint256[] memory amts = new uint256[](2);
        amts[0] = 1;
        amts[1] = 1;
        vm.prank(mallory);
        aqua.ship(address(swapVM), UnisonStrategy.strategyBytes(o), ts, amts);
        vm.expectRevert(abi.encodeWithSelector(PortfolioPrice.PortfolioPriceWrongMaker.selector, maker, mallory));
        swapVM.quote(o, 1e18, takerData(address(this), address(weth), address(usdc), true));
    }
}
