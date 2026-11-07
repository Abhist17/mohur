// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The single pricing surface both venues call. Implemented by TenbinHook.
interface ITenbinPricer {
    /// @notice The wallet whose real balances back every quote.
    function maker() external view returns (address);

    /// @notice Quote a trade from the maker wallet's real balances.
    /// @param isExactIn true: `amount` is the input; false: `amount` is the output.
    function quote(address tokenIn, address tokenOut, uint256 amount, bool isExactIn)
        external
        view
        returns (uint256 amountIn, uint256 amountOut);

    /// @notice Like quote(), for a real 1inch fill: also locks quoting until the fill's coins have moved.
    ///         Only callable by the Tenbin SwapVM router.
    function quoteAndLock(address tokenIn, address tokenOut, uint256 amount, bool isExactIn)
        external
        returns (uint256 amountIn, uint256 amountOut);

    /// @notice Spot price of 1 tokenIn in tokenOut, 18 decimals, fee excluded, decimals normalised.
    function price(address tokenIn, address tokenOut) external view returns (uint256);

    /// @notice Wallet ERC-20 balance plus Uniswap input still held as ERC-6909 claims for the maker.
    function effectiveBalance(address token) external view returns (uint256);
}
