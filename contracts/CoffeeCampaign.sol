// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Educational single-cafe campaign. Not audited; use mock funds only.
/// @dev Original contribution rights are separate from coffee balances. Transfers are disabled.
contract CoffeeCampaign is ERC20, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    enum Phase { Funding, Successful, Failed }
    struct Terms {
        uint256 coffeePrice; // Payment-token base units, not wei or fiat directly.
        uint256 contributionPrice;
        uint256 goalUnits;
        uint256 capUnits;
        uint256 deadline;
        uint256 rewardDuration;
        uint256 revenueBps;
    }
    IERC20 public immutable paymentToken;
    address public immutable treasury;
    uint256 public immutable coffeePrice;
    uint256 public immutable contributionPrice;
    uint256 public immutable goalUnits;
    uint256 public immutable capUnits;
    uint256 public immutable deadline;
    uint256 public immutable rewardDuration;
    uint256 public immutable revenueBps;
    Phase public phase;
    uint256 public totalUnits;
    uint256 public rewardEnd;
    uint256 public totalRewardCredits;
    uint256 public lastRevenuePeriod;
    mapping(address => bool) public approved;
    mapping(address => uint256) public contributedUnits;
    mapping(address => bool) public initialClaimed;
    mapping(address => uint256) public claimedRewardCredits;
    mapping(address => mapping(bytes32 => bool)) public redeemedOrders;
    event WalletApproved(address indexed wallet, bool allowed);
    event Contributed(address indexed backer, uint256 units, uint256 paid);
    event Finalized(Phase phase, uint256 growthFunding, uint256 rewardEnd);
    event Refunded(address indexed backer, uint256 amount);
    event RevenueReported(uint256 indexed period, uint256 grossRevenue, uint256 deposited, bytes32 evidenceHash);
    event CreditsClaimed(address indexed backer, uint256 initialCredits, uint256 rewardCredits);
    event Redeemed(address indexed holder, bytes32 indexed orderHash, uint256 cups, uint256 paidToCafe);

    constructor(address admin, address cafeTreasury, IERC20 asset, Terms memory terms)
        ERC20("Koffie Credits", "KM") Ownable(admin)
    {
        require(cafeTreasury != address(0) && address(asset).code.length > 0, "Invalid treasury or asset");
        require(terms.coffeePrice > 0 && terms.contributionPrice >= terms.coffeePrice, "Invalid prices");
        require(terms.goalUnits > 0 && terms.capUnits >= terms.goalUnits, "Invalid campaign size");
        require(terms.deadline > block.timestamp && terms.rewardDuration > 0 && terms.rewardDuration <= 5 * 365 days, "Invalid timing");
        require(terms.revenueBps > 0 && terms.revenueBps <= 10_000, "Invalid revenue share");
        require(terms.capUnits <= type(uint256).max / terms.contributionPrice && terms.capUnits <= type(uint256).max / 1e18, "Campaign too large");
        paymentToken = asset; treasury = cafeTreasury;
        coffeePrice = terms.coffeePrice; contributionPrice = terms.contributionPrice;
        goalUnits = terms.goalUnits; capUnits = terms.capUnits; deadline = terms.deadline;
        rewardDuration = terms.rewardDuration; revenueBps = terms.revenueBps;
    }
    modifier onlyApproved() { require(approved[msg.sender], "Wallet not approved"); _; }
    function setApproved(address wallet, bool allowed) external onlyOwner {
        require(wallet != address(0), "Zero wallet"); approved[wallet] = allowed;
        emit WalletApproved(wallet, allowed);
    }
    function setPaused(bool value) external onlyOwner { if (value) _pause(); else _unpause(); }
    function renounceOwnership() public pure override { revert("Use two-step ownership transfer"); }

    function contribute(uint256 units) external nonReentrant whenNotPaused onlyApproved {
        require(phase == Phase.Funding && block.timestamp < deadline, "Funding closed");
        require(units > 0 && units <= capUnits - totalUnits, "Invalid units");
        totalUnits += units; contributedUnits[msg.sender] += units;
        uint256 amount = units * contributionPrice;
        _receiveExact(msg.sender, amount);
        emit Contributed(msg.sender, units, amount);
    }
    /// @notice Anyone may close at the deadline or once the cap is reached.
    function finalize() external nonReentrant {
        require(phase == Phase.Funding, "Already finalized");
        require(block.timestamp >= deadline || totalUnits == capUnits, "Funding still open");
        if (totalUnits < goalUnits) { phase = Phase.Failed; emit Finalized(phase, 0, 0); }
        else {
            phase = Phase.Successful;
            rewardEnd = block.timestamp + rewardDuration;
            uint256 growthFunding = totalUnits * (contributionPrice - coffeePrice);
            if (growthFunding > 0) paymentToken.safeTransfer(treasury, growthFunding);
            emit Finalized(phase, growthFunding, rewardEnd);
        }
    }
    function cancel() external onlyOwner {
        require(phase == Phase.Funding, "Already finalized");
        phase = Phase.Failed; emit Finalized(phase, 0, 0);
    }
    /// @notice Pause and approval revocation never disable failed-campaign refunds.
    function refund() external nonReentrant {
        require(phase == Phase.Failed, "No refunds in this phase");
        uint256 units = contributedUnits[msg.sender]; require(units > 0, "Nothing to refund");
        contributedUnits[msg.sender] = 0;
        uint256 amount = units * contributionPrice;
        paymentToken.safeTransfer(msg.sender, amount);
        emit Refunded(msg.sender, amount);
    }
    /// @dev Reporter funds the allocation. An evidence hash commits data; it does not verify sales.
    function reportRevenue(uint256 period, uint256 grossRevenue, bytes32 evidenceHash)
        external onlyOwner nonReentrant whenNotPaused
    {
        require(phase == Phase.Successful && block.timestamp < rewardEnd, "Reporting closed");
        require(period == lastRevenuePeriod + 1 && evidenceHash != bytes32(0), "Invalid report");
        uint256 allocation = Math.mulDiv(grossRevenue, revenueBps, 10_000);
        require(allocation > 0, "No reward allocation");
        lastRevenuePeriod = period;
        totalRewardCredits += Math.mulDiv(allocation, 1e18, coffeePrice);
        _receiveExact(msg.sender, allocation);
        emit RevenueReported(period, grossRevenue, allocation, evidenceHash);
    }
    function claimableRewards(address backer) public view returns (uint256) {
        if (phase != Phase.Successful) return 0;
        return Math.mulDiv(contributedUnits[backer], totalRewardCredits, totalUnits) - claimedRewardCredits[backer];
    }
    function claim() external nonReentrant whenNotPaused onlyApproved {
        require(phase == Phase.Successful, "Campaign not successful");
        uint256 initial = initialClaimed[msg.sender] ? 0 : contributedUnits[msg.sender] * 1e18;
        uint256 reward = claimableRewards(msg.sender);
        require(initial + reward > 0, "Nothing to claim");
        initialClaimed[msg.sender] = true; claimedRewardCredits[msg.sender] += reward;
        _mint(msg.sender, initial + reward);
        emit CreditsClaimed(msg.sender, initial, reward);
    }
    /// @notice Holder burns whole drinks. Production needs merchant-attested POS orders.
    function redeem(uint256 cups, bytes32 orderHash) external nonReentrant whenNotPaused onlyApproved {
        require(phase == Phase.Successful && cups > 0, "Invalid redemption");
        require(orderHash != bytes32(0) && !redeemedOrders[msg.sender][orderHash], "Order already used or empty");
        redeemedOrders[msg.sender][orderHash] = true;
        _burn(msg.sender, cups * 1e18);
        uint256 amount = cups * coffeePrice;
        paymentToken.safeTransfer(treasury, amount);
        emit Redeemed(msg.sender, orderHash, cups, amount);
    }
    function _receiveExact(address from, uint256 amount) private {
        uint256 beforeBalance = paymentToken.balanceOf(address(this));
        paymentToken.safeTransferFrom(from, address(this), amount);
        require(paymentToken.balanceOf(address(this)) - beforeBalance == amount, "Unsupported payment token");
    }
    function _update(address from, address to, uint256 value) internal override {
        require(from == address(0) || to == address(0), "Coffee transfers disabled");
        super._update(from, to, value);
    }
}
