// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { UnisonHook } from "../../src/UnisonHook.sol";
import { UnisonFixture } from "../utils/UnisonFixture.sol";

/// @notice The cross-venue fill lock can't be set, advanced or cleared by anyone but the Unison SwapVM router.
contract FillLockTest is UnisonFixture {
    function setUp() public {
        setUpUnison();
    }

    function test_onlyRouterCanLock() public {
        vm.expectRevert(UnisonHook.NotSwapVM.selector);
        hook.quoteAndLock(address(usdc), address(weth), 100e6, true);
    }

    /// The lock is transaction-scoped (transient storage), so the whole sequence runs inside one call made as the
    /// router: a probe contract is etched at the router's address for this test.
    function test_lockBlocksBothVenues_untilBothTransfersDone() public {
        vm.etch(address(swapVM), address(new LockProbe()).code);
        (bool lockedAfterPrice, bool quoteBlocked, bool lockedAfterOne, bool lockedAfterTwo, bool quoteWorksAfter) =
            LockProbe(address(swapVM)).run(hook, maker, address(usdc), address(weth));
        assertTrue(lockedAfterPrice, "priced fill must lock");
        assertTrue(quoteBlocked, "any quote (both venues) refused mid-fill");
        assertTrue(lockedAfterOne, "still locked after one transfer");
        assertFalse(lockedAfterTwo, "unlocked after both transfers");
        assertTrue(quoteWorksAfter, "quoting works again");
    }

    function test_outsiderCannotClearLock() public {
        vm.expectRevert(UnisonHook.NotSwapVM.selector);
        hook.postTransferIn(maker, address(0), address(0), address(0), 0, 0, 0, bytes32(0), "", "");
        vm.expectRevert(UnisonHook.NotSwapVM.selector);
        hook.postTransferOut(maker, address(0), address(0), address(0), 0, 0, 0, bytes32(0), "", "");
    }

    function test_makerHooksRejectOtherMakers() public {
        vm.prank(address(swapVM));
        vm.expectRevert(UnisonHook.NotMaker.selector);
        hook.postTransferIn(makeAddr("other"), address(0), address(0), address(0), 0, 0, 0, bytes32(0), "", "");
    }

    function test_realFillLeavesNoLockBehind() public {
        swapAqua(trader, address(usdc), address(weth), 1_000e6, true);
        assertFalse(hook.fillLocked());
        // and Uniswap trades right after, in the same test tx
        swapV4(trader, address(weth), address(usdc), 0.1e18, true);
    }
}

contract LockProbe {
    function run(UnisonHook hook, address maker, address usdc, address weth)
        external
        returns (bool a, bool b, bool c, bool d, bool e)
    {
        hook.quoteAndLock(usdc, weth, 100e6, true);
        a = hook.fillLocked();
        try hook.quote(weth, usdc, 1e18, true) { b = false; } catch { b = true; }
        hook.postTransferIn(maker, address(0), address(0), address(0), 0, 0, 0, bytes32(0), "", "");
        c = hook.fillLocked();
        hook.postTransferOut(maker, address(0), address(0), address(0), 0, 0, 0, bytes32(0), "", "");
        d = hook.fillLocked();
        try hook.quote(weth, usdc, 1e18, true) { e = true; } catch { e = false; }
    }
}
