// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IHooks } from "v4-core/interfaces/IHooks.sol";
import { IPoolManager } from "v4-core/interfaces/IPoolManager.sol";
import { IUnlockCallback } from "v4-core/interfaces/callback/IUnlockCallback.sol";
import { Hooks } from "v4-core/libraries/Hooks.sol";
import { PoolKey } from "v4-core/types/PoolKey.sol";
import { Currency } from "v4-core/types/Currency.sol";
import { BalanceDelta } from "v4-core/types/BalanceDelta.sol";
import { BeforeSwapDelta, toBeforeSwapDelta } from "v4-core/types/BeforeSwapDelta.sol";
import { ModifyLiquidityParams, SwapParams } from "v4-core/types/PoolOperation.sol";

import { IAqua } from "@1inch/aqua/contracts/interfaces/IAqua.sol";

import { MohurMath } from "./libraries/MohurMath.sol";
import { IMohurPricer } from "./interfaces/IMohurPricer.sol";

/// @title MohurHook
/// @notice Uniswap v4 custom-curve hook that quotes from, and settles to, one maker wallet.
///
///         - Prices every swap with MohurMath over the wallet's *real* balances (plus pending claims).
///         - Cancels the AMM with a beforeSwap return delta; no LP liquidity is ever used.
///         - Pays the trader straight out of the wallet: sync -> Aqua.pull(...) into the PoolManager -> settle.
///           The hook is an Aqua "app", so this venue can sell at most its Aqua virtual balance.
///         - The trader's input is credited as ERC-6909 claims held by the hook for the maker (routers
///           pay input only after `swap` returns). Claims count as inventory immediately and are moved
///           into the wallet via Aqua.push on the next swap or a permissionless {flush}.
///         - Exposes {quote}/{price}/{effectiveBalance} - the 1inch SwapVM instruction prices through these
///           same functions, so both venues quote identically by construction.
contract MohurHook is IHooks, IUnlockCallback, IMohurPricer {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------------------------------
    // Errors / events
    // ---------------------------------------------------------------------------------------------

    error NotPoolManager();
    error NotMaker();
    error HookNotImplemented();
    error LiquidityNotAccepted();
    error TokenNotInIndex(address token);
    error NativeNotSupported();
    error VenueLimit(address token, uint256 requested, uint256 available);
    error BadIndex();
    error SameToken();

    event IndexSet(address[] tokens, uint256[] weights, uint256 fee);
    event VenueStrategySet(uint256 nonce, bytes32 strategyHash);
    /// @notice One event per Uniswap fill. `fee` is in tokenIn units.
    event Fill(
        address indexed trader,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 fee
    );
    event Flushed(address indexed token, uint256 amount);

    // ---------------------------------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------------------------------

    IPoolManager public immutable poolManager;
    IAqua public immutable aqua;
    address public immutable override maker;

    struct TokenInfo {
        bool listed;
        uint64 index;
        uint256 weight; // 1e18 = 100%
        uint256 scale; // 10^(18 - decimals)
    }

    address[] internal _tokens;
    mapping(address token => TokenInfo) public tokenInfo;
    /// @notice Flat fee, 18 decimals (0.003e18 = 0.30%).
    uint256 public fee;
    /// @notice Aqua strategy nonce for this venue; strategy bytes are abi.encode(address(this), nonce).
    uint256 public venueNonce;
    /// @notice Uniswap input held as ERC-6909 claims for the maker, not yet flushed to the wallet.
    mapping(address token => uint256) public pending;

    /// @dev transient: claims minted in the current transaction (cannot be flushed yet).
    bytes32 private constant _MINTED_THIS_TX_SLOT = keccak256("mohur.hook.mintedThisTx");

    uint256 internal constant MAX_TOKENS = 8;

    constructor(IPoolManager _poolManager, IAqua _aqua, address _maker) {
        poolManager = _poolManager;
        aqua = _aqua;
        maker = _maker;
        Hooks.validateHookPermissions(IHooks(address(this)), getHookPermissions());
    }

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    modifier onlyMaker() {
        if (msg.sender != maker) revert NotMaker();
        _;
    }

    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ---------------------------------------------------------------------------------------------
    // Maker configuration
    // ---------------------------------------------------------------------------------------------

    /// @notice Set (or re-set) the index: tokens, target weights (sum 1e18) and flat fee.
    function setIndex(address[] calldata newTokens, uint256[] calldata newWeights, uint256 _fee) external onlyMaker {
        if (newTokens.length != newWeights.length || newTokens.length < 2 || newTokens.length > MAX_TOKENS) {
            revert BadIndex();
        }
        MohurMath.validateWeights(newWeights);
        MohurMath.validateFee(_fee);
        for (uint256 i; i < _tokens.length; ++i) {
            delete tokenInfo[_tokens[i]];
        }
        delete _tokens;
        for (uint256 i; i < newTokens.length; ++i) {
            address t = newTokens[i];
            if (t == address(0)) revert NativeNotSupported();
            if (tokenInfo[t].listed) revert BadIndex();
            tokenInfo[t] = TokenInfo({
                listed: true,
                index: uint64(i),
                weight: newWeights[i],
                scale: MohurMath.scaleFactor(IERC20Metadata(t).decimals())
            });
            _tokens.push(t);
        }
        fee = _fee;
        emit IndexSet(newTokens, newWeights, _fee);
    }

    /// @notice Point this venue at a new Aqua strategy (e.g. after shipping a topped-up one).
    function setVenueNonce(uint256 nonce) external onlyMaker {
        venueNonce = nonce;
        emit VenueStrategySet(nonce, strategyHash());
    }

    // ---------------------------------------------------------------------------------------------
    // Views shared by both venues
    // ---------------------------------------------------------------------------------------------

    function tokens() external view returns (address[] memory) {
        return _tokens;
    }

    function weights() external view returns (uint256[] memory w) {
        w = new uint256[](_tokens.length);
        for (uint256 i; i < w.length; ++i) {
            w[i] = tokenInfo[_tokens[i]].weight;
        }
    }

    /// @notice Strategy bytes the maker ships to Aqua with app = this hook.
    function strategy(uint256 nonce) public view returns (bytes memory) {
        return abi.encode(address(this), nonce);
    }

    function strategyHash() public view returns (bytes32) {
        return keccak256(strategy(venueNonce));
    }

    /// @notice Remaining amount of `token` this (Uniswap) venue may still sell, per Aqua.
    function venueLimit(address token) public view returns (uint256 available) {
        (available,) = aqua.rawBalances(maker, address(this), strategyHash(), token);
    }

    function effectiveBalance(address token) public view override returns (uint256) {
        return IERC20(token).balanceOf(maker) + pending[token];
    }

    function price(address tokenIn, address tokenOut) external view override returns (uint256) {
        (TokenInfo memory a, TokenInfo memory b) = _pair(tokenIn, tokenOut);
        return MohurMath.spotPrice(
            effectiveBalance(tokenIn) * a.scale, a.weight, effectiveBalance(tokenOut) * b.scale, b.weight
        );
    }

    function quote(address tokenIn, address tokenOut, uint256 amount, bool isExactIn)
        public
        view
        override
        returns (uint256 amountIn, uint256 amountOut)
    {
        (TokenInfo memory a, TokenInfo memory b) = _pair(tokenIn, tokenOut);
        uint256 bi = effectiveBalance(tokenIn) * a.scale;
        uint256 bo = effectiveBalance(tokenOut) * b.scale;
        if (isExactIn) {
            amountIn = amount;
            uint256 outScaled = MohurMath.outGivenIn(bi, a.weight, bo, b.weight, amount * a.scale, fee);
            amountOut = MohurMath.fromScaledDown(outScaled, b.scale);
        } else {
            amountOut = amount;
            uint256 inScaled = MohurMath.inGivenOut(bi, a.weight, bo, b.weight, amount * b.scale, fee);
            amountIn = MohurMath.fromScaledUp(inScaled, a.scale);
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Uniswap v4 hook
    // ---------------------------------------------------------------------------------------------

    function beforeInitialize(address sender, PoolKey calldata key, uint160)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        if (sender != maker) revert NotMaker();
        address t0 = Currency.unwrap(key.currency0);
        address t1 = Currency.unwrap(key.currency1);
        if (t0 == address(0)) revert NativeNotSupported();
        if (!tokenInfo[t0].listed) revert TokenNotInIndex(t0);
        if (!tokenInfo[t1].listed) revert TokenNotInIndex(t1);
        return IHooks.beforeInitialize.selector;
    }

    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert LiquidityNotAccepted();
    }

    function beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        bool exactIn = params.amountSpecified < 0;
        (Currency cIn, Currency cOut) =
            params.zeroForOne ? (key.currency0, key.currency1) : (key.currency1, key.currency0);
        address tokenIn = Currency.unwrap(cIn);
        address tokenOut = Currency.unwrap(cOut);

        // Move earlier Uniswap input (paid in previous transactions) into the wallet first.
        _flushAll();

        uint256 specified = exactIn ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
        (uint256 amountIn, uint256 amountOut) = quote(tokenIn, tokenOut, specified, exactIn);

        // Venue limit: this venue can only sell what Aqua lets it pull.
        uint256 limit = venueLimit(tokenOut);
        if (amountOut > limit) revert VenueLimit(tokenOut, amountOut, limit);

        // Input: credit ERC-6909 claims to the hook, held for the maker (counted in effectiveBalance).
        poolManager.mint(address(this), cIn.toId(), amountIn);
        pending[tokenIn] += amountIn;
        _addMintedThisTx(tokenIn, amountIn);

        // Output: pay the trader straight out of the wallet through Aqua.
        poolManager.sync(cOut);
        aqua.pull(maker, strategyHash(), tokenOut, amountOut, address(poolManager));
        poolManager.settle();

        emit Fill(sender, tokenIn, tokenOut, amountIn, amountOut, MohurMath.mulUp(amountIn, fee));

        BeforeSwapDelta delta = exactIn
            ? toBeforeSwapDelta(int128(int256(amountIn)), -int128(int256(amountOut)))
            : toBeforeSwapDelta(-int128(int256(amountOut)), int128(int256(amountIn)));
        return (IHooks.beforeSwap.selector, delta, 0);
    }

    // ---------------------------------------------------------------------------------------------
    // Flushing claims into the wallet
    // ---------------------------------------------------------------------------------------------

    /// @notice Permissionless: move Uniswap input held as claims into the maker wallet via Aqua.
    function flush() external {
        poolManager.unlock("");
    }

    function unlockCallback(bytes calldata) external onlyPoolManager returns (bytes memory) {
        _flushAll();
        return "";
    }

    /// @notice Claims that can be flushed right now (excludes input minted in this transaction).
    function flushable(address token) public view returns (uint256) {
        uint256 minted = _mintedThisTx(token);
        uint256 p = pending[token];
        return p > minted ? p - minted : 0;
    }

    function _flushAll() internal {
        bytes32 h = strategyHash();
        uint256 n = _tokens.length;
        for (uint256 i; i < n; ++i) {
            address t = _tokens[i];
            uint256 amount = flushable(t);
            if (amount == 0) continue;
            pending[t] -= amount;
            Currency c = Currency.wrap(t);
            poolManager.burn(address(this), c.toId(), amount);
            poolManager.take(c, address(this), amount);
            (, uint8 tokensCount) = aqua.rawBalances(maker, address(this), h, t);
            if (tokensCount > 0 && tokensCount != type(uint8).max) {
                // Re-credit this venue's limit and move the coins into the wallet.
                IERC20(t).forceApprove(address(aqua), amount);
                aqua.push(maker, address(this), h, t, amount);
            } else {
                IERC20(t).safeTransfer(maker, amount);
            }
            emit Flushed(t, amount);
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------------

    function _pair(address tokenIn, address tokenOut) internal view returns (TokenInfo memory a, TokenInfo memory b) {
        if (tokenIn == tokenOut) revert SameToken();
        a = tokenInfo[tokenIn];
        b = tokenInfo[tokenOut];
        if (!a.listed) revert TokenNotInIndex(tokenIn);
        if (!b.listed) revert TokenNotInIndex(tokenOut);
    }

    function _slot(address token) private pure returns (bytes32 s) {
        s = keccak256(abi.encode(_MINTED_THIS_TX_SLOT, token));
    }

    function _mintedThisTx(address token) internal view returns (uint256 v) {
        bytes32 s = _slot(token);
        assembly ("memory-safe") {
            v := tload(s)
        }
    }

    function _addMintedThisTx(address token, uint256 amount) internal {
        bytes32 s = _slot(token);
        assembly ("memory-safe") {
            tstore(s, add(tload(s), amount))
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Unused hook entry points
    // ---------------------------------------------------------------------------------------------

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function afterSwap(address, PoolKey calldata, SwapParams calldata, BalanceDelta, bytes calldata)
        external
        pure
        returns (bytes4, int128)
    {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }
}
