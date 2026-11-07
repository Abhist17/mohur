// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/console2.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IPoolManager } from "v4-core/interfaces/IPoolManager.sol";
import { Aqua } from "@1inch/aqua/contracts/Aqua.sol";
import { ISwapVM } from "@1inch/swap-vm/contracts/interfaces/ISwapVM.sol";

import { TenbinHook } from "../src/TenbinHook.sol";
import { TenbinHookFactory } from "../src/TenbinHookFactory.sol";
import { TenbinTestToken } from "../src/TenbinTestToken.sol";
import { TenbinStrategy } from "../src/aqua/TenbinStrategy.sol";
import { HookMiner } from "../src/libraries/HookMiner.sol";
import { TenbinPools } from "../src/libraries/TenbinPools.sol";
import { TenbinScriptBase } from "./TenbinScriptBase.sol";

/// @notice Launches a 40/30/30 tWETH/tWBTC/tUSDC index from the broadcaster's wallet (the maker):
///         deploy own hook (mined address), faucet tokens, approve Aqua only, set weights, ship the Uniswap venue
///         (50% of each balance) and three 1inch Aqua strategies (25% per pair), open three v4 pools.
contract LaunchIndex is TenbinScriptBase {
    function run() external {
        TenbinHookFactory factory = TenbinHookFactory(readDeployment("hookFactory"));
        Aqua aqua = Aqua(readDeployment("aqua"));
        address swapVM = readDeployment("swapVM");
        IPoolManager pm = IPoolManager(readDeployment("poolManager"));
        address[] memory ts = new address[](3);
        ts[0] = readDeployment("tWETH");
        ts[1] = readDeployment("tWBTC");
        ts[2] = readDeployment("tUSDC");
        uint256[] memory w = new uint256[](3);
        w[0] = 0.4e18;
        w[1] = 0.3e18;
        w[2] = 0.3e18;

        vm.startBroadcast();
        address maker = broadcaster();
        (, bytes32 salt) = HookMiner.find(address(factory), factory.initCodeHash(maker), HookMiner.TENBIN_FLAGS, 0);
        TenbinHook hook = TenbinHook(factory.deploy(salt));

        for (uint256 i; i < 3; ++i) {
            TenbinTestToken(ts[i]).faucet();
            IERC20(ts[i]).approve(address(aqua), type(uint256).max);
        }
        hook.setIndex(ts, w, 0.003e18);

        uint256[] memory amts = new uint256[](3);
        for (uint256 i; i < 3; ++i) {
            amts[i] = IERC20(ts[i]).balanceOf(maker) / 2;
        }
        aqua.ship(address(hook), hook.strategy(0), ts, amts);

        for (uint256 i; i < 3; ++i) {
            for (uint256 j = i + 1; j < 3; ++j) {
                ISwapVM.Order memory o = TenbinStrategy.order(maker, address(hook), ts[i], ts[j], 0);
                (address t0, address t1) = ts[i] < ts[j] ? (ts[i], ts[j]) : (ts[j], ts[i]);
                address[] memory pair = new address[](2);
                pair[0] = t0;
                pair[1] = t1;
                uint256[] memory pa = new uint256[](2);
                pa[0] = IERC20(t0).balanceOf(maker) / 4;
                pa[1] = IERC20(t1).balanceOf(maker) / 4;
                aqua.ship(swapVM, TenbinStrategy.strategyBytes(o), pair, pa);
                pm.initialize(TenbinPools.key(address(hook), ts[i], ts[j]), TenbinPools.SQRT_PRICE_1_1);
            }
        }
        vm.stopBroadcast();

        string memory json = vm.readFile(deploymentsPath());
        vm.writeJson(vm.toString(address(hook)), deploymentsPath(), ".demoHook");
        vm.writeJson(vm.toString(maker), deploymentsPath(), ".demoMaker");
        json;
        console2.log("maker", maker);
        console2.log("hook ", address(hook));
    }
}
