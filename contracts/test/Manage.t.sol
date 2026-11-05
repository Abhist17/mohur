// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ISwapVM } from "@1inch/swap-vm/contracts/interfaces/ISwapVM.sol";
import { MohurStrategy } from "../src/aqua/MohurStrategy.sol";
import { MohurLens } from "../src/MohurLens.sol";
import { MohurLoopRouter } from "../src/MohurLoopRouter.sol";
import { MohurFixture } from "./utils/MohurFixture.sol";

/// @notice The maker stays in control: pause both venues at once, then resume (and top up) under a new epoch.
contract ManageTest is MohurFixture {
    MohurLens lens;
    MohurLoopRouter loop;

    function setUp() public {
        setUpMohur();
        lens = new MohurLens();
        loop = new MohurLoopRouter(manager, ISwapVM(address(swapVM)));
        vm.startPrank(trader);
        usdc.approve(address(loop), type(uint256).max);
        vm.stopPrank();
    }

    function _pairs() internal view returns (address[2][3] memory p) {
        uint256 k;
        for (uint256 i; i < 3; ++i) {
            for (uint256 j = i + 1; j < 3; ++j) {
                (address a, address b) = _sort(tokens[i], tokens[j]);
                p[k++] = [a, b];
            }
        }
    }

    function _pause() internal {
        vm.startPrank(maker);
        aqua.dock(address(hook), hook.strategyHash(), tokens);
        address[2][3] memory p = _pairs();
        for (uint256 k; k < 3; ++k) {
            (,, bytes32 h) = lens.activeAquaOrder(hook, p[k][0], p[k][1]);
            address[] memory ts = new address[](2);
            (ts[0], ts[1]) = (p[k][0], p[k][1]);
            aqua.dock(address(swapVM), h, ts);
        }
        vm.stopPrank();
    }

    function _resume(uint256 bpsV4, uint256 bpsAquaPerPair) internal {
        vm.startPrank(maker);
        uint256 n = hook.venueNonce() + 1;
        hook.setVenueNonce(n);
        uint256[] memory amts = new uint256[](3);
        for (uint256 i; i < 3; ++i) amts[i] = IERC20(tokens[i]).balanceOf(maker) * bpsV4 / 10_000;
        aqua.ship(address(hook), hook.strategy(n), tokens, amts);
        address[2][3] memory p = _pairs();
        for (uint256 k; k < 3; ++k) {
            (, bytes memory strat,) = lens.activeAquaOrder(hook, p[k][0], p[k][1]);
            address[] memory ts = new address[](2);
            (ts[0], ts[1]) = (p[k][0], p[k][1]);
            uint256[] memory a = new uint256[](2);
            a[0] = IERC20(ts[0]).balanceOf(maker) * bpsAquaPerPair / 10_000;
            a[1] = IERC20(ts[1]).balanceOf(maker) * bpsAquaPerPair / 10_000;
            aqua.ship(address(swapVM), strat, ts, a);
        }
        vm.stopPrank();
    }

    function _route(uint8 venue) internal view returns (address[] memory path, uint8[] memory v) {
        path = new address[](2);
        (path[0], path[1]) = (address(usdc), address(weth));
        v = new uint8[](1);
        v[0] = venue;
    }

    function test_pause_stopsBothVenues() public {
        _pause();
        (address[] memory path, uint8[] memory v) = _route(0);
        vm.prank(trader);
        vm.expectRevert();
        loop.execute(address(hook), path, v, 1_000e6, 0, trader);
        v[0] = 1;
        vm.prank(trader);
        vm.expectRevert();
        loop.execute(address(hook), path, v, 1_000e6, 0, trader);
        // the wallet itself is untouched
        assertEq(weth.balanceOf(maker), ETH0);
    }

    function test_resume_withNewEpochAndBiggerLimits() public {
        _pause();
        _resume(8000, 4000); // top up: Uniswap may sell 80% of each balance, 1inch 40% per pair
        assertEq(hook.venueLimit(address(weth)), ETH0 * 8 / 10);
        MohurLens.Book memory b = lens.book(hook, address(swapVM));
        assertEq(b.tokens[0].aquaLimit, ETH0 * 4 / 10 * 2);

        (address[] memory path, uint8[] memory v) = _route(0);
        vm.prank(trader);
        loop.execute(address(hook), path, v, 1_000e6, 0, trader);
        v[0] = 1; // 1inch now uses the epoch-1 order (Salt + PortfolioPrice)
        vm.prank(trader);
        loop.execute(address(hook), path, v, 1_000e6, 0, trader);

        (uint256 a, uint256 bb, bool okA, uint256 c, uint256 d, bool okB) =
            lens.quoteBoth(hook, ISwapVM(address(swapVM)), address(usdc), address(weth), 500e6, true);
        assertTrue(okA && okB);
        assertEq(a, c);
        assertEq(bb, d);
    }

    function test_epochZeroOrder_isUnchanged() public view {
        (ISwapVM.Order memory o,,) = lens.activeAquaOrder(hook, address(weth), address(usdc));
        assertEq(keccak256(abi.encode(o)), keccak256(abi.encode(MohurStrategy.order(maker, address(hook), address(weth), address(usdc), 0))));
    }
}
