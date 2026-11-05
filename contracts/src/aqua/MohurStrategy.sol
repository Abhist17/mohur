// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ISwapVM } from "@1inch/swap-vm/contracts/interfaces/ISwapVM.sol";
import { MakerTraitsLib } from "@1inch/swap-vm/contracts/libs/MakerTraits.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/contracts/libs/TakerTraits.sol";
import { PortfolioPrice } from "./PortfolioPrice.sol";

/// @title MohurStrategy
/// @notice Builds the Aqua-shipped SwapVM order for one pair of the index:
///         program = [Salt(salt)] (optional, stock opcode 0x02) ++ [PortfolioPrice(hook)] (0xd0).
///         The Aqua strategy bytes are abi.encode(order); its hash is the order hash SwapVM uses.
library MohurStrategy {
    uint8 internal constant SALT_OPCODE = 0x02;

    function program(address hook, uint64 salt) internal pure returns (bytes memory) {
        bytes memory p = PortfolioPrice.build(hook);
        if (salt == 0) return p;
        return bytes.concat(abi.encodePacked(SALT_OPCODE, uint8(8), salt), p);
    }

    function order(address maker, address hook, address tokenA, address tokenB, uint64 salt)
        internal
        pure
        returns (ISwapVM.Order memory)
    {
        (address t0, address t1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        MakerTraitsLib.Args memory a;
        a.maker = maker;
        a.receiver = maker;
        a.tokenA = t0;
        a.tokenB = t1;
        a.useAquaInsteadOfSignature = true;
        a.program = program(hook, salt);
        return MakerTraitsLib.build(a);
    }

    function strategyBytes(ISwapVM.Order memory o) internal pure returns (bytes memory) {
        return abi.encode(o);
    }

    function strategyHash(ISwapVM.Order memory o) internal pure returns (bytes32) {
        return keccak256(abi.encode(o));
    }

    /// @notice Taker data for a full (non-partial) fill where the router pulls the taker's input and
    ///         Aqua.push-es it straight into the maker wallet.
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
}
