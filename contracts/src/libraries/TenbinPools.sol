// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IHooks } from "v4-core/interfaces/IHooks.sol";
import { PoolKey } from "v4-core/types/PoolKey.sol";
import { Currency } from "v4-core/types/Currency.sol";

/// @notice Canonical v4 pool keys for a Tenbin index pair. The AMM is never used (the hook cancels it),
///         so fee and tick spacing are fixed conventions.
library TenbinPools {
    uint24 internal constant POOL_FEE = 0;
    int24 internal constant TICK_SPACING = 60;
    uint160 internal constant SQRT_PRICE_1_1 = 79228162514264337593543950336;

    function key(address hook, address a, address b) internal pure returns (PoolKey memory) {
        (address t0, address t1) = a < b ? (a, b) : (b, a);
        return PoolKey({
            currency0: Currency.wrap(t0),
            currency1: Currency.wrap(t1),
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(hook)
        });
    }
}
