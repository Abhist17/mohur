// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MohurLens } from "../src/MohurLens.sol";
import { MohurLoopRouter } from "../src/MohurLoopRouter.sol";
import { ISwapVM } from "@1inch/swap-vm/contracts/interfaces/ISwapVM.sol";
import { MohurFixture } from "./utils/MohurFixture.sol";

contract LensLoopTest is MohurFixture {
    MohurLens lens;
    MohurLoopRouter loop;

    function setUp() public {
        setUpMohur();
        lens = new MohurLens();
        loop = new MohurLoopRouter(manager, ISwapVM(address(swapVM)));
        vm.prank(trader);
        weth.approve(address(loop), type(uint256).max);
    }

    function _route() internal view returns (address[] memory path, uint8[] memory venues) {
        path = new address[](4);
        path[0] = address(weth);
        path[1] = address(usdc);
        path[2] = address(wbtc);
        path[3] = address(weth);
        venues = new uint8[](3);
        venues[0] = 0; // Uniswap
        venues[1] = 1; // 1inch
        venues[2] = 0; // Uniswap
    }

    function test_crossVenueLoop_returnsExactlyItsQuote_andLoses() public {
        (address[] memory path, uint8[] memory venues) = _route();
        (uint256[] memory q, bool ok) = lens.quoteRoute(hook, address(swapVM), path, venues, 0.1e18);
        assertTrue(ok);
        uint256 before = weth.balanceOf(trader);
        vm.prank(trader);
        uint256[] memory got = loop.execute(address(hook), path, venues, 0.1e18, 0, trader);
        for (uint256 k; k < q.length; ++k) {
            assertEq(got[k], q[k], "leg differs from quote");
        }
        assertEq(weth.balanceOf(trader), before - 0.1e18 + got[3]);
        assertLt(got[3], 0.1e18, "loop loses");
    }

    function test_quoteBoth_identical() public {
        (uint256 a, uint256 b, bool okA, uint256 c, uint256 d, bool okB) =
            lens.quoteBoth(hook, ISwapVM(address(swapVM)), address(usdc), address(weth), 2_000e6, true);
        assertTrue(okA && okB);
        assertEq(a, c);
        assertEq(b, d);
    }

    function test_book() public view {
        MohurLens.Book memory b = lens.book(hook, address(swapVM));
        assertEq(b.maker, maker);
        assertEq(b.tokens.length, 3);
        assertEq(b.pairs.length, 3);
        assertEq(b.tokens[0].symbol, "tWETH");
        assertEq(b.tokens[0].v4Limit, ETH0 / 2);
        assertEq(b.tokens[0].aquaLimit, ETH0 / 4 * 2);
        assertEq(b.tokens[2].effectiveBalance, USDC0);
    }

    function test_minOut_enforced() public {
        (address[] memory path, uint8[] memory venues) = _route();
        vm.prank(trader);
        vm.expectRevert();
        loop.execute(address(hook), path, venues, 0.1e18, 0.1e18, trader);
    }
}
