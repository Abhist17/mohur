// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/console2.sol";
import { UnisonFixture } from "./utils/UnisonFixture.sol";

/// @notice What a trade costs on each venue (each test is its own cold transaction, like a real one).
///         Bounds catch regressions; the logged numbers are what docs/explained.md quotes.
contract GasTest is UnisonFixture {
    function setUp() public {
        setUpUnison();
    }

    function test_gas_uniswapSwap() public {
        uint256 g = gasleft();
        _v4SwapCall(trader, address(usdc), address(weth), 1_000e6, true);
        g -= gasleft();
        console2.log("gas: Uniswap v4 swap via UnisonHook (PoolSwapTest router):", g);
        assertLt(g, 400_000);
    }

    function test_gas_oneInchSwap() public {
        uint256 g = gasleft();
        swapAqua(trader, address(usdc), address(weth), 1_000e6, true);
        g -= gasleft();
        console2.log("gas: 1inch Aqua swap via SwapVM opcode 0xd0:", g);
        assertLt(g, 400_000);
    }

    function test_gas_flush() public {
        _v4SwapCall(trader, address(usdc), address(weth), 1_000e6, true);
        uint256 g = gasleft();
        hook.flush();
        g -= gasleft();
        console2.log("gas: flush Uniswap claims into the wallet (Aqua.push):", g);
        assertLt(g, 250_000);
    }

    function test_gas_quote() public view {
        uint256 g = gasleft();
        hook.quote(address(usdc), address(weth), 1_000e6, true);
        g -= gasleft();
        console2.log("gas: quote() (both venues price with this):", g);
        assertLt(g, 120_000);
    }
}
