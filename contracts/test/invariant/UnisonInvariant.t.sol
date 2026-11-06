// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC6909Claims } from "v4-core/interfaces/external/IERC6909Claims.sol";
import { PoolKey } from "v4-core/types/PoolKey.sol";
import { SwapParams } from "v4-core/types/PoolOperation.sol";
import { TickMath } from "v4-core/libraries/TickMath.sol";
import { ISwapVM } from "@1inch/swap-vm/contracts/interfaces/ISwapVM.sol";

import { UnisonHook } from "../../src/UnisonHook.sol";
import { UnisonTestToken } from "../../src/UnisonTestToken.sol";
import { UnisonMath } from "../../src/libraries/UnisonMath.sol";
import { UnisonPools } from "../../src/libraries/UnisonPools.sol";
import { UnisonStrategy } from "../../src/aqua/UnisonStrategy.sol";
import { UnisonFixture, IPoolSwapTest } from "../utils/UnisonFixture.sol";

/// @notice Random actor for the invariant run: trades on both venues, flushes, donates. Keeps ghost books.
contract Handler is Test {
    UnisonHook public hook;
    IPoolSwapTest public v4;
    ISwapVM public svm;
    address public maker;
    address[3] public tok;
    uint256[3] public unit; // a "small" trade size per token

    // ghost state
    int256[3] public expected; // what the maker's effective balance must be
    uint256 public invLast;
    bool public invDropped;
    uint256 public fills;

    constructor(UnisonHook _hook, IPoolSwapTest _v4, ISwapVM _svm, address[3] memory _tok, uint256[3] memory _unit) {
        (hook, v4, svm, tok, unit) = (_hook, _v4, _svm, _tok, _unit);
        maker = hook.maker();
        for (uint256 i; i < 3; ++i) {
            UnisonTestToken(tok[i]).mint(address(this), _unit[i] * 1e6);
            IERC20(tok[i]).approve(address(v4), type(uint256).max);
            IERC20(tok[i]).approve(address(svm), type(uint256).max);
            expected[i] = int256(hook.effectiveBalance(tok[i]));
        }
        invLast = invariantValue();
    }

    /// prod (B_i ^ w_i) on 18-dec scaled effective balances (the weighted-pool invariant)
    function invariantValue() public view returns (uint256 v) {
        v = 1e18;
        for (uint256 i; i < 3; ++i) {
            (,,, uint256 scale) = hook.tokenInfo(tok[i]);
            v = UnisonMath.mulDown(v, UnisonMath.powDown(hook.effectiveBalance(tok[i]) * scale, hook.weightOf(tok[i])));
        }
    }

    function _pick(uint256 a, uint256 b) internal pure returns (uint256 i, uint256 j) {
        i = a % 3;
        j = (i + 1 + (b % 2)) % 3;
    }

    function _book(uint256 i, uint256 j, uint256 amountIn, uint256 amountOut) internal {
        expected[i] += int256(amountIn);
        expected[j] -= int256(amountOut);
        fills++;
        uint256 v = invariantValue();
        // pow() carries a ~1e-14 relative error budget; anything beyond that is a real drop
        if (v + v / 1e12 < invLast) invDropped = true;
        invLast = v;
    }

    function swapUniswap(uint256 a, uint256 b, uint256 size, bool exactIn) external {
        (uint256 i, uint256 j) = _pick(a, b);
        uint256 amt = bound(size, 1, 40) * unit[exactIn ? i : j];
        bool zeroForOne = tok[i] < tok[j];
        PoolKey memory key = UnisonPools.key(address(hook), tok[i], tok[j]);
        SwapParams memory p = SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: exactIn ? -int256(amt) : int256(amt),
            sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
        });
        uint256 inB = IERC20(tok[i]).balanceOf(address(this));
        uint256 outB = IERC20(tok[j]).balanceOf(address(this));
        try v4.swap(key, p, IPoolSwapTest.TestSettings(false, false), "") {
            _book(i, j, inB - IERC20(tok[i]).balanceOf(address(this)), IERC20(tok[j]).balanceOf(address(this)) - outB);
        } catch { }
    }

    function swap1inch(uint256 a, uint256 b, uint256 size, bool exactIn) external {
        (uint256 i, uint256 j) = _pick(a, b);
        uint256 amt = bound(size, 1, 40) * unit[exactIn ? i : j];
        ISwapVM.Order memory o = UnisonStrategy.order(maker, address(hook), tok[i], tok[j], uint64(hook.venueNonce()));
        try svm.swap(o, amt, UnisonStrategy.takerData(address(this), tok[i], tok[j], exactIn)) returns (uint256 ain, uint256 aout, bytes32) {
            _book(i, j, ain, aout);
        } catch { }
    }

    function flush() external {
        try hook.flush() { } catch { }
    }

    function donate(uint256 a, uint256 size) external {
        uint256 i = a % 3;
        uint256 amt = bound(size, 1, 20) * unit[i];
        IERC20(tok[i]).transfer(maker, amt);
        expected[i] += int256(amt);
        invLast = invariantValue(); // a donation raises the invariant; it is not a trade
    }
}

contract UnisonInvariantTest is UnisonFixture {
    Handler handler;

    function setUp() public {
        setUpUnison();
        handler = new Handler(
            hook,
            v4Router,
            ISwapVM(address(swapVM)),
            [address(weth), address(wbtc), address(usdc)],
            [uint256(0.01e18), 0.0003e8, 30e6]
        );
        targetContract(address(handler));
    }

    /// 1. One price: both venues quote the same for every pair (when both can fill it).
    function invariant_samePriceBothVenues() public {
        for (uint256 i; i < 3; ++i) {
            for (uint256 j; j < 3; ++j) {
                if (i == j) continue;
                uint256 amt = [uint256(0.01e18), 0.0003e8, 30e6][i];
                (, uint256 h) = hook.quote(tokens[i], tokens[j], amt, true);
                try swapVM.quote(aquaOrderAt(tokens[i], tokens[j]), amt, takerData(address(this), tokens[i], tokens[j], true)) returns (uint256, uint256 a, bytes32) {
                    assertEq(a, h, "venues disagree");
                } catch { } // 1inch can refuse when its limit is spent; Uniswap's quote is then irrelevant
            }
        }
    }

    /// 2. Exact accounting: the wallet changes only by fills (and donations). Nothing leaks.
    function invariant_walletChangesOnlyByFills() public view {
        for (uint256 i; i < 3; ++i) {
            assertEq(int256(hook.effectiveBalance(tokens[i])), handler.expected(i), "wallet drift");
        }
    }

    /// 3. Uniswap input held as claims is fully backed by ERC-6909 balances in the PoolManager.
    function invariant_claimsFullyBacked() public view {
        for (uint256 i; i < 3; ++i) {
            uint256 id = uint256(uint160(tokens[i]));
            assertEq(IERC6909Claims(address(manager)).balanceOf(address(hook), id), hook.pending(tokens[i]), "claims != pending");
        }
    }

    /// 4. The weighted invariant never falls across trades (fees and rounding only add): why every loop loses.
    function invariant_valueInvariantNeverFalls() public view {
        assertFalse(handler.invDropped(), "invariant decreased on a trade");
    }

    /// 5. The maker never gains an allowance to anything but Aqua.
    function invariant_onlyAquaApproved() public view {
        for (uint256 i; i < 3; ++i) {
            assertEq(IERC20(tokens[i]).allowance(maker, address(hook)), 0);
            assertEq(IERC20(tokens[i]).allowance(maker, address(swapVM)), 0);
            assertEq(IERC20(tokens[i]).allowance(maker, address(manager)), 0);
        }
    }

    function afterInvariant() public view {
        // make sure the run actually traded (not just reverted)
        assertGt(handler.fills(), 0, "no fills happened");
    }

    function aquaOrderAt(address a, address b) internal view returns (ISwapVM.Order memory) {
        return UnisonStrategy.order(maker, address(hook), a, b, uint64(hook.venueNonce()));
    }
}
