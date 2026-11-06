// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/console2.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { UnisonHook } from "../src/UnisonHook.sol";
import { UnisonLoopRouter } from "../src/UnisonLoopRouter.sol";
import { UnisonTestToken } from "../src/UnisonTestToken.sol";
import { UnisonScriptBase } from "./UnisonScriptBase.sol";

/// @notice A handful of real fills on both venues against the demo index (so the dashboard has a fill feed).
contract DemoTrades is UnisonScriptBase {
    function run() external {
        UnisonLoopRouter loop = UnisonLoopRouter(readDeployment("loopRouter"));
        address hook = readDeployment("demoHook");
        address weth = readDeployment("tWETH");
        address wbtc = readDeployment("tWBTC");
        address usdc = readDeployment("tUSDC");

        vm.startBroadcast();
        address trader = broadcaster();
        UnisonTestToken(weth).faucet();
        UnisonTestToken(wbtc).faucet();
        UnisonTestToken(usdc).faucet();
        IERC20(weth).approve(address(loop), type(uint256).max);
        IERC20(wbtc).approve(address(loop), type(uint256).max);
        IERC20(usdc).approve(address(loop), type(uint256).max);

        _leg(loop, hook, weth, usdc, 0, 0.25e18, trader); // sell ETH on Uniswap
        _leg(loop, hook, usdc, wbtc, 1, 1_500e6, trader); // buy BTC on 1inch
        _leg(loop, hook, wbtc, weth, 0, 0.004e8, trader); // BTC -> ETH on Uniswap
        _leg(loop, hook, usdc, weth, 1, 800e6, trader); // buy ETH on 1inch
        UnisonHook(hook).flush(); // move Uniswap input (claims) into the wallet
        vm.stopBroadcast();
        console2.log("demo fills done for trader", trader);
    }

    function _leg(UnisonLoopRouter loop, address hook, address a, address b, uint8 venue, uint256 amt, address to)
        internal
    {
        address[] memory path = new address[](2);
        path[0] = a;
        path[1] = b;
        uint8[] memory v = new uint8[](1);
        v[0] = venue;
        loop.execute(hook, path, v, amt, 0, to);
    }
}
