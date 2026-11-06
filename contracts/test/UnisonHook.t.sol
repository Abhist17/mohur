// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IHooks } from "v4-core/interfaces/IHooks.sol";
import { PoolKey } from "v4-core/types/PoolKey.sol";
import { Currency } from "v4-core/types/Currency.sol";
import { ModifyLiquidityParams } from "v4-core/types/PoolOperation.sol";

import { UnisonHook } from "../src/UnisonHook.sol";
import { UnisonTestToken } from "../src/UnisonTestToken.sol";
import { HookMiner } from "../src/libraries/HookMiner.sol";
import { UnisonFixture } from "./utils/UnisonFixture.sol";

contract UnisonHookTest is UnisonFixture {
    function setUp() public {
        setUpUnison();
    }

    function test_hookAddressHasExactlyUnisonFlags() public view {
        assertEq(uint160(address(hook)) & HookMiner.FLAG_MASK, HookMiner.UNISON_FLAGS);
        assertEq(hook.maker(), maker);
        assertEq(factory.hookOf(maker), address(hook));
    }

    function test_exactIn_paysFromWallet_andPricesFromWallet() public {
        uint256 quoted;
        (, quoted) = hook.quote(address(weth), address(usdc), 1e18, true);
        uint256 makerUsdcBefore = usdc.balanceOf(maker);

        (uint256 amountIn, uint256 amountOut) = swapV4(trader, address(weth), address(usdc), 1e18, true);

        assertEq(amountIn, 1e18);
        assertEq(amountOut, quoted, "v4 fill == hook quote");
        assertEq(makerUsdcBefore - usdc.balanceOf(maker), amountOut, "output came out of the wallet");
        // input is held as claims for the maker and already counts as inventory
        assertEq(hook.pending(address(weth)), 1e18);
        assertEq(hook.effectiveBalance(address(weth)), ETH0 + 1e18);
        // 1 ETH is 10% of the ETH balance: ~$4,000 less the 0.3% fee and ~9% price impact
        assertGt(amountOut, 3_500e6);
        assertLt(amountOut, 3_988e6);
    }

    function test_exactOut() public {
        (uint256 quotedIn,) = hook.quote(address(usdc), address(wbtc), 0.01e8, false);
        (uint256 amountIn, uint256 amountOut) = swapV4(trader, address(usdc), address(wbtc), 0.01e8, false);
        assertEq(amountOut, 0.01e8);
        assertEq(amountIn, quotedIn);
    }

    function test_claimsFlushIntoWalletOnNextSwap_viaAqua() public {
        swapV4(trader, address(weth), address(usdc), 1e18, true);
        uint256 limitBefore = hook.venueLimit(address(weth));
        assertEq(weth.balanceOf(maker), ETH0, "not flushed in same tx");

        // a later swap (new tx) first flushes the earlier input into the wallet
        swapV4(trader, address(usdc), address(wbtc), 100e6, true);
        assertEq(hook.pending(address(weth)), 0);
        assertEq(weth.balanceOf(maker), ETH0 + 1e18, "flushed to wallet");
        assertEq(hook.venueLimit(address(weth)), limitBefore + 1e18, "flush re-credits this venue's Aqua limit");
    }

    function test_permissionlessFlush() public {
        swapV4(trader, address(wbtc), address(weth), 0.01e8, true);
        vm.prank(makeAddr("anyone"));
        hook.flush();
        assertEq(hook.pending(address(wbtc)), 0);
        assertEq(wbtc.balanceOf(maker), BTC0 + 0.01e8);
    }

    function test_venueLimit_stopsAtAquaCap_walletKeepsRest() public {
        // drain the v4 venue's USDC allowance (15k) with repeated buys; wallet still holds the rest
        uint256 cap = hook.venueLimit(address(usdc));
        assertEq(cap, USDC0 / 2);
        uint256 sold;
        for (uint256 i; i < 20; ++i) {
            (, uint256 q) = hook.quote(address(weth), address(usdc), 0.5e18, true);
            if (sold + q > cap) break;
            (, uint256 out) = swapV4(trader, address(weth), address(usdc), 0.5e18, true);
            sold += out;
        }
        uint256 left = hook.venueLimit(address(usdc));
        assertEq(left, cap - sold);
        (, uint256 next) = hook.quote(address(weth), address(usdc), 0.5e18, true);
        assertGt(next, left);
        vm.expectRevert();
        _v4SwapCall(trader, address(weth), address(usdc), 0.5e18, true);
        assertGt(usdc.balanceOf(maker), 0, "wallet keeps the rest");
    }

    function test_revert_addLiquidity() public {
        PoolKey memory key = poolKey(address(weth), address(usdc));
        vm.prank(address(manager));
        vm.expectRevert(UnisonHook.LiquidityNotAccepted.selector);
        hook.beforeAddLiquidity(address(this), key, ModifyLiquidityParams(-60, 60, 1e18, 0), "");
    }

    function test_revert_onlyMakerCreatesPools_onlyIndexTokens() public {
        UnisonTestToken other = new UnisonTestToken("x", "X", 18, 0);
        (address t0, address t1) = _sort(address(other), address(usdc));
        PoolKey memory key = PoolKey(Currency.wrap(t0), Currency.wrap(t1), 0, 10, IHooks(address(hook)));
        vm.prank(maker);
        vm.expectRevert();
        manager.initialize(key, SQRT_PRICE_1_1);

        PoolKey memory k2 = poolKey(address(weth), address(usdc));
        k2.tickSpacing = 10;
        vm.prank(trader);
        vm.expectRevert();
        manager.initialize(k2, SQRT_PRICE_1_1);
    }

    function test_revert_onlyMakerConfigures() public {
        vm.expectRevert(UnisonHook.NotMaker.selector);
        hook.setIndex(tokens, weights, FEE);
    }

    function test_weightsChange_movesPriceImmediately() public {
        uint256 p0 = hook.price(address(weth), address(usdc));
        assertApproxEqRel(p0, 4000e18, 1e12);
        uint256[] memory w = new uint256[](3);
        w[0] = 0.5e18;
        w[1] = 0.25e18;
        w[2] = 0.25e18;
        vm.prank(maker);
        hook.setIndex(tokens, w, FEE);
        // same balances, heavier ETH weight -> wallet values ETH higher
        assertGt(hook.price(address(weth), address(usdc)), p0);
    }

    function test_cannotDropTokenWithPendingClaims() public {
        swapV4(trader, address(usdc), address(weth), 1_000e6, true); // USDC input now held as claims
        address[] memory t2 = new address[](2);
        t2[0] = address(weth);
        t2[1] = address(wbtc);
        uint256[] memory w2 = new uint256[](2);
        w2[0] = 0.5e18;
        w2[1] = 0.5e18;
        vm.prank(maker);
        vm.expectRevert(abi.encodeWithSelector(UnisonHook.PendingClaims.selector, address(usdc)));
        hook.setIndex(t2, w2, FEE);
        hook.flush();
        vm.prank(maker);
        hook.setIndex(t2, w2, FEE); // fine once flushed into the wallet
        assertEq(usdc.balanceOf(maker), USDC0 + 1_000e6, "claims reached the wallet");
    }

    function test_makerOnlyApprovesAqua() public view {
        for (uint256 i; i < 3; ++i) {
            IERC20 t = IERC20(tokens[i]);
            assertEq(t.allowance(maker, address(aqua)), type(uint256).max);
            assertEq(t.allowance(maker, address(hook)), 0);
            assertEq(t.allowance(maker, address(manager)), 0);
            assertEq(t.allowance(maker, address(v4Router)), 0);
            assertEq(t.allowance(maker, address(swapVM)), 0);
        }
    }
}
