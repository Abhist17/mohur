// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IPoolManager } from "v4-core/interfaces/IPoolManager.sol";
import { IHooks } from "v4-core/interfaces/IHooks.sol";
import { PoolKey } from "v4-core/types/PoolKey.sol";
import { Currency } from "v4-core/types/Currency.sol";
import { SwapParams } from "v4-core/types/PoolOperation.sol";
import { BalanceDelta } from "v4-core/types/BalanceDelta.sol";
import { TickMath } from "v4-core/libraries/TickMath.sol";

import { Aqua } from "@1inch/aqua/contracts/Aqua.sol";
import { IAqua } from "@1inch/aqua/contracts/interfaces/IAqua.sol";
import { ISwapVM } from "@1inch/swap-vm/contracts/interfaces/ISwapVM.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/contracts/libs/TakerTraits.sol";

import { MohurHook } from "../../src/MohurHook.sol";
import { MohurHookFactory } from "../../src/MohurHookFactory.sol";
import { MohurTestToken } from "../../src/MohurTestToken.sol";
import { MohurSwapVMRouter } from "../../src/aqua/MohurSwapVMRouter.sol";
import { MohurStrategy } from "../../src/aqua/MohurStrategy.sol";
import { HookMiner } from "../../src/libraries/HookMiner.sol";

/// @dev Minimal view of v4-core's PoolSwapTest (deployed from its own 0.8.26 artifact).
interface IPoolSwapTest {
    struct TestSettings {
        bool takeClaims;
        bool settleUsingBurn;
    }

    function swap(PoolKey memory key, SwapParams memory params, TestSettings memory settings, bytes memory hookData)
        external
        payable
        returns (BalanceDelta);
}

/// @notice Deploys the whole Mohur system on a fresh chain: Aqua, MohurSwapVMRouter, the real v4 PoolManager,
///         three test tokens, a mined MohurHook, three v4 pools and three Aqua SwapVM strategies.
///         Index: 40% tWETH / 30% tWBTC / 30% tUSDC worth $100k at ETH $4,000, BTC $100,000.
abstract contract MohurFixture is Test {
    string internal constant V4_OUT = "lib/v4-periphery/lib/v4-core/out/";

    uint256 internal constant FEE = 0.003e18;
    uint24 internal constant POOL_FEE = 0;
    int24 internal constant TICK_SPACING = 60;
    uint160 internal constant SQRT_PRICE_1_1 = 79228162514264337593543950336;

    IPoolManager internal manager;
    IPoolSwapTest internal v4Router;
    Aqua internal aqua;
    MohurSwapVMRouter internal swapVM;
    MohurHookFactory internal factory;
    MohurHook internal hook;

    MohurTestToken internal weth;
    MohurTestToken internal wbtc;
    MohurTestToken internal usdc;
    address[] internal tokens;
    uint256[] internal weights;

    address internal maker = makeAddr("maker");
    address internal trader = makeAddr("trader");

    // initial wallet: $40k ETH, $30k BTC, $30k USDC
    uint256 internal constant ETH0 = 10e18;
    uint256 internal constant BTC0 = 0.3e8;
    uint256 internal constant USDC0 = 30_000e6;

    function setUpMohur() internal {
        manager = _poolManager();
        v4Router = IPoolSwapTest(deployCode(string.concat(V4_OUT, "PoolSwapTest.sol/PoolSwapTest.json"), abi.encode(address(manager))));
        aqua = new Aqua();

        weth = new MohurTestToken("Mohur Test WETH", "tWETH", 18, 10e18);
        wbtc = new MohurTestToken("Mohur Test WBTC", "tWBTC", 8, 0.3e8);
        usdc = new MohurTestToken("Mohur Test USDC", "tUSDC", 6, 30_000e6);
        swapVM = new MohurSwapVMRouter(address(aqua), address(weth), address(this));
        factory = new MohurHookFactory(manager, IAqua(address(aqua)));

        tokens = [address(weth), address(wbtc), address(usdc)];
        weights = [uint256(0.4e18), 0.3e18, 0.3e18];

        // mine + deploy the maker's hook through the factory
        (, bytes32 salt) = HookMiner.find(address(factory), factory.initCodeHash(maker), HookMiner.MOHUR_FLAGS, 0);
        vm.prank(maker);
        hook = MohurHook(factory.deploy(salt));

        weth.mint(maker, ETH0);
        wbtc.mint(maker, BTC0);
        usdc.mint(maker, USDC0);

        vm.startPrank(maker);
        for (uint256 i; i < 3; ++i) {
            IERC20(tokens[i]).approve(address(aqua), type(uint256).max); // the maker's ONLY approval
        }
        hook.setIndex(tokens, weights, FEE);
        _shipV4Venue(5000); // 50% of each balance for the Uniswap venue
        _shipAquaVenue(2500); // 25% per pair -> 50% of each token for the 1inch venue
        for (uint256 i; i < 3; ++i) {
            for (uint256 j = i + 1; j < 3; ++j) {
                manager.initialize(poolKey(tokens[i], tokens[j]), SQRT_PRICE_1_1);
            }
        }
        vm.stopPrank();

        // trader funds + approvals
        weth.mint(trader, 100e18);
        wbtc.mint(trader, 10e8);
        usdc.mint(trader, 1_000_000e6);
        vm.startPrank(trader);
        for (uint256 i; i < 3; ++i) {
            IERC20(tokens[i]).approve(address(v4Router), type(uint256).max);
            IERC20(tokens[i]).approve(address(swapVM), type(uint256).max);
        }
        vm.stopPrank();
    }

    /// @dev Local tests deploy a fresh PoolManager; fork tests override this with the live one.
    function _poolManager() internal virtual returns (IPoolManager) {
        return IPoolManager(deployCode(string.concat(V4_OUT, "PoolManager.sol/PoolManager.json"), abi.encode(address(this))));
    }

    function _shipV4Venue(uint256 bps) internal {
        uint256[] memory amounts = new uint256[](3);
        for (uint256 i; i < 3; ++i) {
            amounts[i] = IERC20(tokens[i]).balanceOf(maker) * bps / 10_000;
        }
        aqua.ship(address(hook), hook.strategy(hook.venueNonce()), tokens, amounts);
    }

    function _shipAquaVenue(uint256 bps) internal {
        for (uint256 i; i < 3; ++i) {
            for (uint256 j = i + 1; j < 3; ++j) {
                ISwapVM.Order memory o = aquaOrder(tokens[i], tokens[j]);
                (address t0, address t1) = _sort(tokens[i], tokens[j]);
                address[] memory ts = new address[](2);
                ts[0] = t0;
                ts[1] = t1;
                uint256[] memory amts = new uint256[](2);
                amts[0] = IERC20(t0).balanceOf(maker) * bps / 10_000;
                amts[1] = IERC20(t1).balanceOf(maker) * bps / 10_000;
                aqua.ship(address(swapVM), MohurStrategy.strategyBytes(o), ts, amts);
            }
        }
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _sort(address a, address b) internal pure returns (address, address) {
        return a < b ? (a, b) : (b, a);
    }

    function poolKey(address a, address b) internal view returns (PoolKey memory) {
        (address t0, address t1) = _sort(a, b);
        return PoolKey({
            currency0: Currency.wrap(t0),
            currency1: Currency.wrap(t1),
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(hook))
        });
    }

    function aquaOrder(address a, address b) internal view returns (ISwapVM.Order memory) {
        return MohurStrategy.order(maker, address(hook), a, b, 0);
    }

    function takerData(address taker, address tokenIn, address tokenOut, bool exactIn)
        internal
        pure
        returns (bytes memory)
    {
        TakerTraitsLib.Args memory t;
        t.taker = taker;
        t.isExactIn = exactIn;
        t.useTransferFromAndAquaPush = true;
        t.isAToB = tokenIn < tokenOut;
        return TakerTraitsLib.build(t);
    }

    /// @dev Swap on Uniswap v4 through the real PoolManager. Returns (amountIn, amountOut).
    function swapV4(address who, address tokenIn, address tokenOut, uint256 amount, bool exactIn)
        internal
        returns (uint256 amountIn, uint256 amountOut)
    {
        uint256 inBefore = IERC20(tokenIn).balanceOf(who);
        uint256 outBefore = IERC20(tokenOut).balanceOf(who);
        bool zeroForOne = tokenIn < tokenOut;
        vm.prank(who);
        v4Router.swap(
            poolKey(tokenIn, tokenOut),
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: exactIn ? -int256(amount) : int256(amount),
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            IPoolSwapTest.TestSettings({ takeClaims: false, settleUsingBurn: false }),
            ""
        );
        amountIn = inBefore - IERC20(tokenIn).balanceOf(who);
        amountOut = IERC20(tokenOut).balanceOf(who) - outBefore;
    }

    /// @dev Only the router call (so vm.expectRevert can target it).
    function _v4SwapCall(address who, address tokenIn, address tokenOut, uint256 amount, bool exactIn) internal {
        bool zeroForOne = tokenIn < tokenOut;
        PoolKey memory key = poolKey(tokenIn, tokenOut);
        SwapParams memory params = SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: exactIn ? -int256(amount) : int256(amount),
            sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
        });
        IPoolSwapTest.TestSettings memory settings = IPoolSwapTest.TestSettings(false, false);
        vm.prank(who);
        v4Router.swap(key, params, settings, "");
    }

    /// @dev Swap on 1inch Aqua through MohurSwapVMRouter. Returns (amountIn, amountOut).
    function swapAqua(address who, address tokenIn, address tokenOut, uint256 amount, bool exactIn)
        internal
        returns (uint256 amountIn, uint256 amountOut)
    {
        vm.prank(who);
        (amountIn, amountOut,) =
            swapVM.swap(aquaOrder(tokenIn, tokenOut), amount, takerData(who, tokenIn, tokenOut, exactIn));
    }

    function quoteAqua(address tokenIn, address tokenOut, uint256 amount, bool exactIn)
        internal
        returns (uint256 amountIn, uint256 amountOut)
    {
        (amountIn, amountOut,) =
            swapVM.quote(aquaOrder(tokenIn, tokenOut), amount, takerData(address(this), tokenIn, tokenOut, exactIn));
    }

    /// @dev USD value of the maker's effective holdings at external prices (18 dec), per token.
    function valuesUsd(uint256 ethUsd, uint256 btcUsd) internal view returns (uint256[3] memory v, uint256 total) {
        v[0] = hook.effectiveBalance(address(weth)) * ethUsd / 1e18;
        v[1] = hook.effectiveBalance(address(wbtc)) * 1e10 * btcUsd / 1e18;
        v[2] = hook.effectiveBalance(address(usdc)) * 1e12;
        total = v[0] + v[1] + v[2];
    }
}
