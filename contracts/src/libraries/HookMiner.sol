// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title HookMiner
/// @notice Finds a CREATE2 salt whose address carries exactly the given v4 hook-permission bits.
library HookMiner {
    uint160 internal constant FLAG_MASK = uint160((1 << 14) - 1);
    /// beforeInitialize | beforeAddLiquidity | beforeSwap | beforeSwapReturnDelta
    uint160 internal constant UNISON_FLAGS = uint160((1 << 13) | (1 << 11) | (1 << 7) | (1 << 3));

    error SaltNotFound();

    function compute(address deployer, bytes32 salt, bytes32 initCodeHash) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, initCodeHash)))));
    }

    function find(address deployer, bytes32 initCodeHash, uint160 flags, uint256 start)
        internal
        pure
        returns (address hook, bytes32 salt)
    {
        for (uint256 i = start; i < start + 400_000; ++i) {
            salt = bytes32(i);
            hook = compute(deployer, salt, initCodeHash);
            if (uint160(hook) & FLAG_MASK == flags) return (hook, salt);
        }
        revert SaltNotFound();
    }
}
