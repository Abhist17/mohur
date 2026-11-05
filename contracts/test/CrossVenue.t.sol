// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/console2.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MohurFixture } from "./utils/MohurFixture.sol";

/// @notice The headline claims: one inventory, two venues, one price; loops lose; arbitrage rebalances.
contract CrossVenueTest is MohurFixture {
    function setUp() public {
        setUpMohur();
    }

    /// Same price on both venues: 0 units of difference, all 6 directions, exact-in and exact-out.
    function test_samePrice_allSixDirections_bothModes() public {
        uint256[3] memory amt = [uint256(0.5e18), 0.01e8, 1_000e6];
        for (uint256 i; i < 3; ++i) {
            for (uint256 j; j < 3; ++j) {
                if (i == j) continue;
                (address ti, address tj) = (tokens[i], tokens[j]);
                // exact-in: v4 fill (in a snapshot) vs 1inch quote
                uint256 snap = vm.snapshotState();
                (, uint256 v4Out) = swapV4(trader, ti, tj, amt[i], true);
                vm.revertToState(snap);
                (, uint256 aquaOut) = quoteAqua(ti, tj, amt[i], true);
                assertEq(v4Out, aquaOut, "exact-in differs");

                // exact-out
                uint256 want = amt[j] / 4;
                snap = vm.snapshotState();
                (uint256 v4In,) = swapV4(trader, ti, tj, want, false);
                vm.revertToState(snap);
                (uint256 aquaIn,) = quoteAqua(ti, tj, want, false);
                assertEq(v4In, aquaIn, "exact-out differs");
            }
        }
    }

    /// A fill on Uniswap moves the 1inch quote (and vice versa), including pending claims.
    function test_fillOnOneVenueMovesTheOther() public {
        (, uint256 before) = quoteAqua(address(weth), address(usdc), 1e18, true);
        swapV4(trader, address(weth), address(usdc), 2e18, true); // input sits as claims
        assertGt(hook.pending(address(weth)), 0);
        (, uint256 afterV4) = quoteAqua(address(weth), address(usdc), 1e18, true);
        (, uint256 math) = hook.quote(address(weth), address(usdc), 1e18, true);
        assertLt(afterV4, before, "ETH got cheaper on 1inch after a Uniswap sell");
        assertEq(afterV4, math);

        // and the other way round
        (, uint256 v4Before) = hook.quote(address(usdc), address(wbtc), 1_000e6, true);
        swapAqua(trader, address(usdc), address(wbtc), 3_000e6, true);
        (, uint256 v4After) = hook.quote(address(usdc), address(wbtc), 1_000e6, true);
        assertLt(v4After, v4Before, "BTC got dearer on Uniswap after a 1inch buy");
    }

    /// ETH -> USDC on Uniswap, USDC -> BTC on 1inch, BTC -> ETH on Uniswap: loses money.
    function test_threeLegLoopAcrossVenues_loses() public {
        uint256 start = 0.1e18;
        (, uint256 usdcOut) = swapV4(trader, address(weth), address(usdc), start, true);
        (, uint256 btcOut) = swapAqua(trader, address(usdc), address(wbtc), usdcOut, true);
        (, uint256 ethBack) = swapV4(trader, address(wbtc), address(weth), btcOut, true);
        assertLt(ethBack, start, "loop must lose");
        uint256 lossBps = (start - ethBack) * 10_000 / start;
        console2.log("3-leg cross-venue loop loss (bps):", lossBps);
        // ~3 fees (0.9%) less the little each fee wins back by staying in the wallet
        assertGe(lossBps, 85);
        assertLe(lossBps, 95);
    }

    function test_threeLegLoop_largeTrade_stillLoses() public {
        uint256 start = 1e18; // 10% of the ETH balance
        (, uint256 usdcOut) = swapV4(trader, address(weth), address(usdc), start, true);
        (, uint256 btcOut) = swapAqua(trader, address(usdc), address(wbtc), usdcOut, true);
        (, uint256 ethBack) = swapV4(trader, address(wbtc), address(weth), btcOut, true);
        assertLt(ethBack, start);
        console2.log("3-leg loop, 1 ETH, loss (bps):", (start - ethBack) * 10_000 / start);
    }

    function testFuzz_anyLoop_loses(uint256 a, uint8 route) public {
        a = bound(a, 0.001e18, 2e18);
        bool v1 = route & 1 == 1;
        bool v2 = route & 2 == 2;
        bool v3 = route & 4 == 4;
        (, uint256 x) = v1 ? swapV4(trader, address(weth), address(wbtc), a, true) : swapAqua(trader, address(weth), address(wbtc), a, true);
        (, uint256 y) = v2 ? swapV4(trader, address(wbtc), address(usdc), x, true) : swapAqua(trader, address(wbtc), address(usdc), x, true);
        (, uint256 z) = v3 ? swapV4(trader, address(usdc), address(weth), y, true) : swapAqua(trader, address(usdc), address(weth), y, true);
        assertLt(z, a);
    }

    /// ETH 4,000 -> 5,000: arbitrageurs buying what is cheap restore 40/30/30 by value.
    function test_selfRebalancing_afterEthJump() public {
        uint256 ethUsd = 5_000e18;
        uint256 btcUsd = 100_000e18;
        // Arbitrageur: while Mohur sells ETH below $5,000, buy ETH with USDC on one venue and with BTC
        // on the other, in small steps (each venue only fills while its price is off-market).
        for (uint256 k; k < 200; ++k) {
            bool traded;
            uint256 pUsdc = hook.price(address(weth), address(usdc)); // USDC per ETH
            if (pUsdc * 1003 / 1000 < ethUsd) {
                k % 2 == 0
                    ? swapV4(trader, address(usdc), address(weth), 100e6, true)
                    : swapAqua(trader, address(usdc), address(weth), 100e6, true);
                traded = true;
            }
            uint256 pBtc = hook.price(address(weth), address(wbtc)); // BTC per ETH, 1e18 = 1 BTC
            if (pBtc * btcUsd / 1e18 * 1003 / 1000 < ethUsd) {
                k % 2 == 1
                    ? swapV4(trader, address(wbtc), address(weth), 0.001e8, true)
                    : swapAqua(trader, address(wbtc), address(weth), 0.001e8, true);
                traded = true;
            }
            if (!traded) break;
        }
        (uint256[3] memory v, uint256 total) = valuesUsd(ethUsd, btcUsd);
        uint256 wEth = v[0] * 10_000 / total;
        uint256 wBtc = v[1] * 10_000 / total;
        uint256 wUsd = v[2] * 10_000 / total;
        console2.log("weights after ETH 4000->5000 (bps) ETH/BTC/USDC:", wEth, wBtc, wUsd);
        assertApproxEqAbs(wEth, 4000, 30);
        assertApproxEqAbs(wBtc, 3000, 30);
        assertApproxEqAbs(wUsd, 3000, 30);
    }

    /// Neither venue can move coins except through Aqua's per-venue accounting.
    function test_scopedApprovals_onlyAqua() public {
        swapV4(trader, address(weth), address(usdc), 1e18, true);
        swapAqua(trader, address(usdc), address(wbtc), 1_000e6, true);
        address[4] memory others = [address(hook), address(swapVM), address(manager), address(v4Router)];
        for (uint256 i; i < 3; ++i) {
            for (uint256 k; k < 4; ++k) {
                assertEq(IERC20(tokens[i]).allowance(maker, others[k]), 0);
            }
        }
    }
}
