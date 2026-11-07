// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/console2.sol";
import { IPoolManager } from "v4-core/interfaces/IPoolManager.sol";
import { Aqua } from "@1inch/aqua/contracts/Aqua.sol";
import { IAqua } from "@1inch/aqua/contracts/interfaces/IAqua.sol";
import { ISwapVM } from "@1inch/swap-vm/contracts/interfaces/ISwapVM.sol";

import { TenbinSwapVMRouter } from "../src/aqua/TenbinSwapVMRouter.sol";
import { TenbinHookFactory } from "../src/TenbinHookFactory.sol";
import { TenbinLens } from "../src/TenbinLens.sol";
import { TenbinLoopRouter } from "../src/TenbinLoopRouter.sol";
import { TenbinTestToken } from "../src/TenbinTestToken.sol";
import { TenbinScriptBase } from "./TenbinScriptBase.sol";

/// @notice Deploys the shared Tenbin infrastructure. Uses the live Uniswap v4 PoolManager when it exists
///         (Base Sepolia or a fork of it); deploys the official Aqua source (Aqua is not on any testnet).
/// forge script script/DeployTenbin.s.sol --rpc-url <rpc> --broadcast (--private-key | --account)
contract DeployTenbin is TenbinScriptBase {
    function run() external {
        uint256 startBlock = block.number;
        vm.startBroadcast();
        address deployer = broadcaster();

        IPoolManager pm = IPoolManager(BASE_SEPOLIA_POOL_MANAGER);
        require(address(pm).code.length > 0, "no v4 PoolManager: run on Base Sepolia or a fork of it");

        Aqua aqua = new Aqua();
        TenbinSwapVMRouter swapVM = new TenbinSwapVMRouter(address(aqua), BASE_SEPOLIA_WETH, deployer);
        TenbinHookFactory factory = new TenbinHookFactory(pm, IAqua(address(aqua)), address(swapVM));
        TenbinLens lens = new TenbinLens();
        TenbinLoopRouter loop = new TenbinLoopRouter(pm, ISwapVM(address(swapVM)));
        TenbinTestToken tWETH = new TenbinTestToken("Tenbin Test WETH (testnet, no value)", "tWETH", 18, 10e18);
        TenbinTestToken tWBTC = new TenbinTestToken("Tenbin Test WBTC (testnet, no value)", "tWBTC", 8, 0.3e8);
        TenbinTestToken tUSDC = new TenbinTestToken("Tenbin Test USDC (testnet, no value)", "tUSDC", 6, 30_000e6);
        vm.stopBroadcast();

        string memory o = "deploy";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeUint(o, "startBlock", startBlock);
        vm.serializeAddress(o, "poolManager", address(pm));
        vm.serializeAddress(o, "aqua", address(aqua));
        vm.serializeAddress(o, "swapVM", address(swapVM));
        vm.serializeAddress(o, "hookFactory", address(factory));
        vm.serializeAddress(o, "lens", address(lens));
        vm.serializeAddress(o, "loopRouter", address(loop));
        vm.serializeAddress(o, "tWETH", address(tWETH));
        vm.serializeAddress(o, "tWBTC", address(tWBTC));
        string memory json = vm.serializeAddress(o, "tUSDC", address(tUSDC));
        // a fresh clone has no deployments/ folder yet (its only file, local.json, is gitignored)
        vm.createDir(string.concat(vm.projectRoot(), "/deployments"), true);
        vm.writeJson(json, deploymentsPath());
        console2.log("deployments written to", deploymentsPath());
    }
}
