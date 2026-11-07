// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IPoolManager } from "v4-core/interfaces/IPoolManager.sol";
import { IUnlockCallback } from "v4-core/interfaces/callback/IUnlockCallback.sol";
import { Currency } from "v4-core/types/Currency.sol";
import { BalanceDelta } from "v4-core/types/BalanceDelta.sol";
import { SwapParams } from "v4-core/types/PoolOperation.sol";
import { TickMath } from "v4-core/libraries/TickMath.sol";

import { ISwapVM } from "@1inch/swap-vm/contracts/interfaces/ISwapVM.sol";

import { ITenbinPricer } from "./interfaces/ITenbinPricer.sol";
import { TenbinPools } from "./libraries/TenbinPools.sol";
import { TenbinStrategy } from "./aqua/TenbinStrategy.sol";

interface ITenbinEpoch {
    function venueNonce() external view returns (uint256);
}

/// @title TenbinLoopRouter
/// @notice Runs a multi-leg exact-in route across both venues of one Tenbin wallet in a single transaction
///         (the "Arbitrage me" demo). venues[k]: 0 = Uniswap v4 (through the real PoolManager), 1 = 1inch Aqua.
contract TenbinLoopRouter is IUnlockCallback {
    using SafeERC20 for IERC20;

    IPoolManager public immutable poolManager;
    ISwapVM public immutable swapVM;

    error NotPoolManager();
    error BadRoute();
    error InsufficientOutput(uint256 amountOut, uint256 minOut);

    event Route(address indexed trader, address indexed hook, address[] path, uint8[] venues, uint256[] amounts);

    struct Ctx {
        address hook;
        address[] path;
        uint8[] venues;
        uint256 amountIn;
    }

    constructor(IPoolManager _poolManager, ISwapVM _swapVM) {
        poolManager = _poolManager;
        swapVM = _swapVM;
    }

    function execute(
        address hook,
        address[] calldata path,
        uint8[] calldata venues,
        uint256 amountIn,
        uint256 minOut,
        address recipient
    ) external returns (uint256[] memory amounts) {
        if (path.length != venues.length + 1 || venues.length == 0) revert BadRoute();
        IERC20(path[0]).safeTransferFrom(msg.sender, address(this), amountIn);

        Ctx memory c = Ctx(hook, path, venues, amountIn);
        bool anyV4;
        for (uint256 k; k < venues.length; ++k) {
            if (venues[k] == 0) anyV4 = true;
        }
        amounts = anyV4 ? abi.decode(poolManager.unlock(abi.encode(c)), (uint256[])) : _run(c);

        uint256 out = amounts[amounts.length - 1];
        if (out < minOut) revert InsufficientOutput(out, minOut);
        IERC20(path[path.length - 1]).safeTransfer(recipient, out);
        emit Route(msg.sender, hook, path, venues, amounts);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        return abi.encode(_run(abi.decode(data, (Ctx))));
    }

    function _run(Ctx memory c) internal returns (uint256[] memory amounts) {
        amounts = new uint256[](c.path.length);
        amounts[0] = c.amountIn;
        for (uint256 k; k < c.venues.length; ++k) {
            amounts[k + 1] = c.venues[k] == 0
                ? _v4(c.hook, c.path[k], c.path[k + 1], amounts[k])
                : _aqua(c.hook, c.path[k], c.path[k + 1], amounts[k]);
        }
    }

    function _v4(address hook, address tokenIn, address tokenOut, uint256 amount) internal returns (uint256 out) {
        bool zeroForOne = tokenIn < tokenOut;
        BalanceDelta d = poolManager.swap(
            TenbinPools.key(hook, tokenIn, tokenOut),
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(amount),
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );
        int128 outDelta = zeroForOne ? d.amount1() : d.amount0();
        out = uint256(int256(outDelta));
        // pay the input, collect the output
        poolManager.sync(Currency.wrap(tokenIn));
        IERC20(tokenIn).safeTransfer(address(poolManager), amount);
        poolManager.settle();
        poolManager.take(Currency.wrap(tokenOut), address(this), out);
    }

    function _aqua(address hook, address tokenIn, address tokenOut, uint256 amount) internal returns (uint256 out) {
        ISwapVM.Order memory o =
            TenbinStrategy.order(ITenbinPricer(hook).maker(), hook, tokenIn, tokenOut, uint64(ITenbinEpoch(hook).venueNonce()));
        IERC20(tokenIn).forceApprove(address(swapVM), amount);
        (, out,) = swapVM.swap(o, amount, TenbinStrategy.takerData(address(this), tokenIn, tokenOut, true));
    }
}
