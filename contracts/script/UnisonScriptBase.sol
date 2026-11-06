// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script } from "forge-std/Script.sol";
import { stdJson } from "forge-std/StdJson.sol";

abstract contract UnisonScriptBase is Script {
    using stdJson for string;

    address constant BASE_SEPOLIA_POOL_MANAGER = 0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408;
    address constant BASE_SEPOLIA_WETH = 0x4200000000000000000000000000000000000006;

    function networkName() internal view returns (string memory) {
        if (block.chainid == 84532) return "base-sepolia";
        if (block.chainid == 31337) return "local";
        return vm.toString(block.chainid);
    }

    function deploymentsPath() internal view returns (string memory) {
        return string.concat(vm.projectRoot(), "/deployments/", networkName(), ".json");
    }

    function readDeployment(string memory key) internal view returns (address) {
        return vm.readFile(deploymentsPath()).readAddress(string.concat(".", key));
    }

    function broadcaster() internal returns (address who) {
        (, who,) = vm.readCallers();
    }
}
