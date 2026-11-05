// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IPoolManager } from "v4-core/interfaces/IPoolManager.sol";
import { PoolKey } from "v4-core/types/PoolKey.sol";
import { MohurFixture } from "../utils/MohurFixture.sol";

interface IV4QuoterLive {
    struct QuoteExactSingleParams {
        PoolKey poolKey;
        bool zeroForOne;
        uint128 exactAmount;
        bytes hookData;
    }

    function quoteExactInputSingle(QuoteExactSingleParams memory params)
        external
        returns (uint256 amountOut, uint256 gasEstimate);
}

interface IUniversalRouter {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}

interface IPermit2 {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

/// @notice Mohur against the REAL Uniswap v4 deployment on Base Sepolia (run: forge test --match-path 'test/fork/*').
contract V4BaseSepoliaForkTest is MohurFixture {
    IPoolManager constant POOL_MANAGER = IPoolManager(0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408);
    IV4QuoterLive constant QUOTER = IV4QuoterLive(0x4A6513c898fe1B2d0E78d3b0e0A4a151589B1cBa);
    IUniversalRouter constant UNIVERSAL_ROUTER = IUniversalRouter(0x492E6456D9528771018DeB9E87ef7750EF184104);
    IPermit2 constant PERMIT2 = IPermit2(0x000000000022D473030F116dDEE9F6B43aC78BA3);

    /// Universal Router v4 ExactInputSingleParams as deployed on Base Sepolia.
    struct ExactInputSingleParams {
        PoolKey poolKey;
        bool zeroForOne;
        uint128 amountIn;
        uint128 amountOutMinimum;
        bytes hookData;
    }

    bool internal forked;

    function setUp() public {
        try vm.createSelectFork("base_sepolia") {
            forked = true;
        } catch {
            return;
        }
        setUpMohur();
    }

    function _poolManager() internal pure override returns (IPoolManager) {
        return POOL_MANAGER;
    }

    function test_fork_officialV4QuoterEqualsHookQuote() public {
        if (!forked) return;
        PoolKey memory key = poolKey(address(weth), address(usdc));
        bool zeroForOne = address(weth) < address(usdc);
        (uint256 quoterOut,) = QUOTER.quoteExactInputSingle(
            IV4QuoterLive.QuoteExactSingleParams({ poolKey: key, zeroForOne: zeroForOne, exactAmount: 0.5e18, hookData: "" })
        );
        (, uint256 hookOut) = hook.quote(address(weth), address(usdc), 0.5e18, true);
        assertEq(quoterOut, hookOut, "official V4Quoter == hook quote");
    }

    function test_fork_universalRouterSwapPaysFromWallet() public {
        if (!forked) return;
        PoolKey memory key = poolKey(address(usdc), address(wbtc));
        bool zeroForOne = address(usdc) < address(wbtc);
        uint128 amountIn = 2_000e6;
        (, uint256 expected) = hook.quote(address(usdc), address(wbtc), amountIn, true);

        vm.startPrank(trader);
        usdc.approve(address(PERMIT2), type(uint256).max);
        PERMIT2.approve(address(usdc), address(UNIVERSAL_ROUTER), type(uint160).max, type(uint48).max);

        bytes memory actions = abi.encodePacked(uint8(0x06), uint8(0x0c), uint8(0x0f)); // SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(ExactInputSingleParams(key, zeroForOne, amountIn, uint128(expected), ""));
        params[1] = abi.encode(address(usdc), uint256(amountIn));
        params[2] = abi.encode(address(wbtc), expected);
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(actions, params);

        uint256 makerBtc = wbtc.balanceOf(maker);
        uint256 traderBtc = wbtc.balanceOf(trader);
        UNIVERSAL_ROUTER.execute(abi.encodePacked(uint8(0x10)), inputs, block.timestamp + 60); // V4_SWAP
        vm.stopPrank();

        assertEq(wbtc.balanceOf(trader) - traderBtc, expected, "trader got the hook quote");
        assertEq(makerBtc - wbtc.balanceOf(maker), expected, "paid straight out of the wallet");
        assertEq(hook.pending(address(usdc)), amountIn, "input held as claims for the maker");
        assertEq(IERC20(address(usdc)).allowance(maker, address(UNIVERSAL_ROUTER)), 0);
    }
}
