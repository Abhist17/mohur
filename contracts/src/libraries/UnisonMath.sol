// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { LogExpMath } from "./LogExpMath.sol";

/// @title UnisonMath
/// @notice The one pricing formula both venues use: a weighted-pool (constant value) curve over the
///         maker wallet's *real* balances. Every rounding step favours the maker.
/// @dev All amounts handed to the public functions are 18-decimal "scaled" amounts; callers scale
///      token-native amounts with {toScaled}/{fromScaledDown}/{fromScaledUp}.
///
///      spot(i->j)  = (w_i / w_j) * (B_j / B_i)
///      outGivenIn  = B_o * (1 - (B_i / (B_i + a*(1-f)))^(w_i/w_o))
///      inGivenOut  = B_i * ((B_o / (B_o - a))^(w_o/w_i) - 1) / (1-f)
library UnisonMath {
    uint256 internal constant ONE = 1e18;
    /// @dev A single trade may move at most 30% of a balance (keeps pow() accurate).
    uint256 internal constant MAX_RATIO = 0.3e18;
    /// @dev Max relative error of LogExpMath.pow, as in Balancer (1e-14).
    uint256 internal constant MAX_POW_RELATIVE_ERROR = 10_000;
    uint256 internal constant MIN_WEIGHT = 0.01e18; // 1%
    uint256 internal constant MAX_FEE = 0.1e18; // 10%

    error MaxInRatio();
    error MaxOutRatio();
    error ZeroBalance();
    error ZeroAmount();
    error BadWeights();
    error BadFee();
    error BadDecimals();

    // ----------------------------------------------------------------------------------------
    // Fixed point helpers (Balancer FixedPoint semantics)
    // ----------------------------------------------------------------------------------------

    function mulDown(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a * b) / ONE;
    }

    function mulUp(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 p = a * b;
        return p == 0 ? 0 : (p - 1) / ONE + 1;
    }

    function divDown(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a * ONE) / b;
    }

    function divUp(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a == 0) return 0;
        return (a * ONE - 1) / b + 1;
    }

    function complement(uint256 x) internal pure returns (uint256) {
        return x < ONE ? ONE - x : 0;
    }

    function powDown(uint256 x, uint256 y) internal pure returns (uint256) {
        if (y == ONE) return x;
        if (y == 2 * ONE) return mulDown(x, x);
        uint256 raw = LogExpMath.pow(x, y);
        uint256 maxError = mulUp(raw, MAX_POW_RELATIVE_ERROR) + 1;
        return raw < maxError ? 0 : raw - maxError;
    }

    function powUp(uint256 x, uint256 y) internal pure returns (uint256) {
        if (y == ONE) return x;
        if (y == 2 * ONE) return mulUp(x, x);
        uint256 raw = LogExpMath.pow(x, y);
        uint256 maxError = mulUp(raw, MAX_POW_RELATIVE_ERROR) + 1;
        return raw + maxError;
    }

    // ----------------------------------------------------------------------------------------
    // Decimals
    // ----------------------------------------------------------------------------------------

    function scaleFactor(uint8 decimals) internal pure returns (uint256) {
        if (decimals > 18) revert BadDecimals();
        return 10 ** (18 - decimals);
    }

    function toScaled(uint256 amount, uint256 factor) internal pure returns (uint256) {
        return amount * factor;
    }

    function fromScaledDown(uint256 scaled, uint256 factor) internal pure returns (uint256) {
        return scaled / factor;
    }

    function fromScaledUp(uint256 scaled, uint256 factor) internal pure returns (uint256) {
        return scaled == 0 ? 0 : (scaled - 1) / factor + 1;
    }

    // ----------------------------------------------------------------------------------------
    // Validation
    // ----------------------------------------------------------------------------------------

    /// @notice Weights must each be >= 1% and sum to exactly 1e18.
    function validateWeights(uint256[] memory weights) internal pure {
        if (weights.length < 2) revert BadWeights();
        uint256 sum;
        for (uint256 i; i < weights.length; ++i) {
            if (weights[i] < MIN_WEIGHT) revert BadWeights();
            sum += weights[i];
        }
        if (sum != ONE) revert BadWeights();
    }

    function validateFee(uint256 fee) internal pure {
        if (fee > MAX_FEE) revert BadFee();
    }

    // ----------------------------------------------------------------------------------------
    // Pricing
    // ----------------------------------------------------------------------------------------

    /// @notice Spot price of token i in units of token j (18 decimals, fee excluded).
    function spotPrice(uint256 balanceI, uint256 weightI, uint256 balanceJ, uint256 weightJ)
        internal
        pure
        returns (uint256)
    {
        if (balanceI == 0 || balanceJ == 0) revert ZeroBalance();
        // (B_j / w_j) / (B_i / w_i)
        return divDown(divDown(balanceJ, weightJ), divUp(balanceI, weightI));
    }

    /// @notice Tokens out for an exact input. Rounds down (maker's favour).
    function outGivenIn(
        uint256 balanceIn,
        uint256 weightIn,
        uint256 balanceOut,
        uint256 weightOut,
        uint256 amountIn,
        uint256 fee
    ) internal pure returns (uint256 amountOut) {
        if (balanceIn == 0 || balanceOut == 0) revert ZeroBalance();
        if (amountIn == 0) revert ZeroAmount();
        if (amountIn > mulDown(balanceIn, MAX_RATIO)) revert MaxInRatio();

        uint256 amountInNet = mulDown(amountIn, ONE - fee);
        uint256 base = divUp(balanceIn, balanceIn + amountInNet);
        uint256 exponent = divDown(weightIn, weightOut);
        uint256 power = powUp(base, exponent);
        amountOut = mulDown(balanceOut, complement(power));
        if (amountOut > mulDown(balanceOut, MAX_RATIO)) revert MaxOutRatio();
    }

    /// @notice Tokens in for an exact output. Rounds up (maker's favour).
    function inGivenOut(
        uint256 balanceIn,
        uint256 weightIn,
        uint256 balanceOut,
        uint256 weightOut,
        uint256 amountOut,
        uint256 fee
    ) internal pure returns (uint256 amountIn) {
        if (balanceIn == 0 || balanceOut == 0) revert ZeroBalance();
        if (amountOut == 0) revert ZeroAmount();
        if (amountOut > mulDown(balanceOut, MAX_RATIO)) revert MaxOutRatio();

        uint256 base = divUp(balanceOut, balanceOut - amountOut);
        uint256 exponent = divUp(weightOut, weightIn);
        uint256 power = powUp(base, exponent);
        uint256 ratio = power - ONE;
        uint256 amountInNet = mulUp(balanceIn, ratio);
        amountIn = divUp(amountInNet, ONE - fee);
        if (amountIn > mulDown(balanceIn, MAX_RATIO)) revert MaxInRatio();
    }
}
