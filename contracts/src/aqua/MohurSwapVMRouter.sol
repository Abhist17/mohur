// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Context } from "@1inch/swap-vm/contracts/libs/VM.sol";
import { AquaSwapVMRouter } from "@1inch/swap-vm/contracts/routers/AquaSwapVMRouter.sol";
import { PortfolioPrice } from "./PortfolioPrice.sol";

/// @title MohurSwapVMRouter
/// @notice The official 1inch AquaSwapVMRouter, unchanged, plus one extra opcode (0xd0 = PortfolioPrice)
///         in the unallocated 0xd0-0xef bank. Every stock Aqua opcode still dispatches exactly as upstream.
contract MohurSwapVMRouter is AquaSwapVMRouter {
    constructor(address aqua, address weth, address owner)
        AquaSwapVMRouter(aqua, weth, owner, "MohurSwapVMRouter", "1")
    { }

    function _runOpcode(Context memory ctx, uint256 opcode, bytes calldata args) internal override {
        if (opcode == PortfolioPrice.OPCODE) PortfolioPrice.exec(ctx, args);
        else super._runOpcode(ctx, opcode, args);
    }
}
