// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IPoolManager } from "v4-core/interfaces/IPoolManager.sol";
import { IAqua } from "@1inch/aqua/contracts/interfaces/IAqua.sol";
import { MohurHook } from "./MohurHook.sol";

/// @title MohurHookFactory
/// @notice Deploys one MohurHook per maker with CREATE2, so the hook address (whose low bits encode
///         its v4 permissions) can be mined off-chain - in the browser - before deploying.
contract MohurHookFactory {
    IPoolManager public immutable poolManager;
    IAqua public immutable aqua;
    /// @notice The Mohur SwapVM router every hook trusts for 1inch fills.
    address public immutable swapVM;

    mapping(address maker => address hook) public hookOf;

    event HookDeployed(address indexed maker, address hook, bytes32 salt);

    constructor(IPoolManager _poolManager, IAqua _aqua, address _swapVM) {
        poolManager = _poolManager;
        aqua = _aqua;
        swapVM = _swapVM;
    }

    /// @notice init code hash for a given maker; mine `salt` so that the CREATE2 address has the flags.
    function initCodeHash(address maker) public view returns (bytes32) {
        return keccak256(abi.encodePacked(type(MohurHook).creationCode, abi.encode(poolManager, aqua, swapVM, maker)));
    }

    function predict(address maker, bytes32 salt) external view returns (address) {
        return address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash(maker)))))
        );
    }

    /// @notice Deploy the caller's hook. The caller becomes the hook's maker.
    function deploy(bytes32 salt) external returns (address hook) {
        hook = address(new MohurHook{ salt: salt }(poolManager, aqua, swapVM, msg.sender));
        hookOf[msg.sender] = hook;
        emit HookDeployed(msg.sender, hook, salt);
    }
}
