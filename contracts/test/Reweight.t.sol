// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/console2.sol";
import { TenbinHook } from "../src/TenbinHook.sol";
import { TenbinFixture } from "./utils/TenbinFixture.sol";

/// @notice Changing the allocation: gradual re-weighting (both venues glide together) vs an instant switch.
contract ReweightTest is TenbinFixture {
    uint256 constant ETH_USD = 4_000e18;
    uint256 constant BTC_USD = 100_000e18;

    function setUp() public {
        setUpTenbin();
    }

    function _w(uint256 a, uint256 b, uint256 c) internal pure returns (uint256[] memory w) {
        w = new uint256[](3);
        (w[0], w[1], w[2]) = (a, b, c);
    }

    function test_weightsGlideLinearly_andBothVenuesFollow() public {
        vm.prank(maker);
        hook.scheduleWeights(_w(0.5e18, 0.25e18, 0.25e18), 1000);
        assertEq(hook.weightOf(address(weth)), 0.4e18);

        uint256 t0 = block.timestamp;
        vm.warp(t0 + 500);
        assertEq(hook.weightOf(address(weth)), 0.45e18);
        assertEq(hook.weightOf(address(wbtc)), 0.275e18);
        assertEq(hook.weightOf(address(usdc)), 0.275e18);
        // both venues price with the mid-glide weights
        (, uint256 hookOut) = hook.quote(address(usdc), address(weth), 1_000e6, true);
        (, uint256 aquaOut) = quoteAqua(address(usdc), address(weth), 1_000e6, true);
        assertEq(hookOut, aquaOut);

        vm.warp(t0 + 10_000);
        assertEq(hook.weightOf(address(weth)), 0.5e18);
        uint256[] memory t = hook.targetWeights();
        assertEq(t[0], 0.5e18);
    }

    function test_revert_onlyMakerSchedules() public {
        vm.expectRevert(TenbinHook.NotMaker.selector);
        hook.scheduleWeights(_w(0.5e18, 0.25e18, 0.25e18), 1000);
    }

    function test_revert_badScheduledWeights() public {
        vm.prank(maker);
        vm.expectRevert();
        hook.scheduleWeights(_w(0.5e18, 0.25e18, 0.2e18), 1000);
    }

    /// The headline: moving 40/30/30 -> 50/25/25 at constant market prices.
    function test_gradualReweight_costsLessThanInstant() public {
        (, uint256 v0) = valuesUsd(ETH_USD, BTC_USD);
        uint256 snap = vm.snapshotState();

        // (a) instant switch, then arbitrageurs trade the wallet to market
        vm.prank(maker);
        hook.setIndex(tokens, _w(0.5e18, 0.25e18, 0.25e18), FEE);
        _arbToMarket();
        (uint256[3] memory va, uint256 instantV) = valuesUsd(ETH_USD, BTC_USD);

        vm.revertToState(snap);

        // (b) glide over 50 steps; arbitrageurs act after each step
        vm.prank(maker);
        hook.scheduleWeights(_w(0.5e18, 0.25e18, 0.25e18), 50 hours);
        // keep our own clock: with via-IR, block.timestamp can be cached within a test
        uint256 t = block.timestamp;
        for (uint256 k; k < 50; ++k) {
            t += 1 hours;
            vm.warp(t);
            _arbToMarket();
        }
        (uint256[3] memory vb, uint256 gradualV) = valuesUsd(ETH_USD, BTC_USD);

        int256 instantPnl = int256(instantV) - int256(v0);
        int256 gradualPnl = int256(gradualV) - int256(v0);
        console2.log("start value (USD)", v0 / 1e18);
        console2.log("instant switch, value after (USD)", instantV / 1e18);
        console2.log("gradual 50 steps, value after (USD)", gradualV / 1e18);
        console2.log("instant ETH weight bps", va[0] * 10_000 / instantV);
        console2.log("gradual ETH weight bps", vb[0] * 10_000 / gradualV);
        assertGt(gradualPnl, instantPnl, "gradual must beat instant");
        // both actually reach the new allocation
        assertApproxEqAbs(vb[0] * 10_000 / gradualV, 5000, 60);
        assertApproxEqAbs(va[0] * 10_000 / instantV, 5000, 60);
    }

    // --------------------------------------------------------------------------------------------
    // A simple arbitrageur: while Tenbin's price for a pair is off the market by more than the fee,
    // trade a small clip in the profitable direction (alternating venues). Market prices are fixed.
    // --------------------------------------------------------------------------------------------

    function _mkt(address t) internal view returns (uint256) {
        if (t == address(weth)) return ETH_USD;
        if (t == address(wbtc)) return BTC_USD;
        return 1e18;
    }

    function _clip(address t) internal view returns (uint256) {
        if (t == address(weth)) return 0.02e18;
        if (t == address(wbtc)) return 0.0008e8;
        return 80e6;
    }

    function _arbToMarket() internal {
        for (uint256 it; it < 600; ++it) {
            bool traded;
            for (uint256 i; i < 3; ++i) {
                for (uint256 j = i + 1; j < 3; ++j) {
                    (address a, address b) = (tokens[i], tokens[j]);
                    uint256 p = hook.price(a, b); // b per a, 18 dec, decimal-normalised
                    uint256 mkt = _mkt(a) * 1e18 / _mkt(b);
                    if (p * 1004 / 1000 < mkt) {
                        // a is cheap at Tenbin: pay b, receive a
                        _trade(b, a, it);
                        traded = true;
                    } else if (p > mkt * 1004 / 1000) {
                        // a is dear at Tenbin: pay a, receive b
                        _trade(a, b, it);
                        traded = true;
                    }
                }
            }
            if (!traded) return;
        }
    }

    function _trade(address payTok, address getTok, uint256 it) internal {
        if (it % 2 == 0) swapV4(trader, payTok, getTok, _clip(payTok), true);
        else swapAqua(trader, payTok, getTok, _clip(payTok), true);
    }
}
