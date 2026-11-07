// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TenbinTestToken
/// @notice Clearly labelled TESTNET faucet token (tWETH / tWBTC / tUSDC). No value.
contract TenbinTestToken is ERC20 {
    uint8 private immutable _dec;
    uint256 public immutable faucetAmount;

    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 faucetAmount_)
        ERC20(name_, symbol_)
    {
        _dec = decimals_;
        faucetAmount = faucetAmount_;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    /// @notice Anyone can mint `faucetAmount` to themselves. Testnet only.
    function faucet() external {
        _mint(msg.sender, faucetAmount);
    }

    /// @notice Arbitrary mint for scripts and tests. Testnet only.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
