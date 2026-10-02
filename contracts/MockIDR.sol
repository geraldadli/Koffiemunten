// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
/// @notice Local/testnet faucet. No financial value or link to real rupiah.
contract MockIDR is ERC20 {
    constructor() ERC20("Demo Rupiah", "mIDR") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address recipient, uint256 amount) external { _mint(recipient, amount); }
}
