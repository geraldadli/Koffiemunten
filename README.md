# Koffiemunten

A working browser prototype and executable Solidity starter for one café campaign. The published website is a **simulation**. It is not connected to a wallet, RPC endpoint, real payment service, or deployed contract. No money is collected. The café and campaign progress are illustrative; the coffee image comes from the supplied pitch deck.

## Run it

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev
# Open http://127.0.0.1:4173
npm run compile
npm test
```

Try: hold 10 coffees → Run café scenario → complete campaign → submit revenue report → close dialog → claim credits → redeem a latte. That produces 11 KM, then 10 KM after redemption. Refresh resets the local demo.

## What Solidity does

Solidity is the language for the contract, not the website. `contracts/CoffeeCampaign.sol` is an ERC-20 beverage-credit ledger plus one funding campaign. `contracts/MockIDR.sol` is a freely mintable test token with 6 decimals; it is **not real rupiah or a real stablecoin**. KM has 18 decimals; 1 whole KM buys one defined house latte.

| Action | Contract behavior |
| --- | --- |
| Approve an account | Admin sets a wallet flag. This is not a KYC integration. |
| Contribute | Approved wallet deposits `units × contributionPrice`; the contract holds all funds in escrow. |
| Finalize | Anyone closes at the deadline or cap. Success releases only the premium to the fixed café treasury. Failure enables refunds. |
| Claim original coffee | After success, each original unit can mint 1 KM, once. |
| Report revenue | Admin submits the next sequential period and an evidence hash, and deposits the agreed revenue allocation. |
| Claim rewards | Original contribution weight determines additional KM. Claiming cannot pay the same reward twice. |
| Redeem | Holder burns whole KM; the reserve pays the fixed coffee price to the café. An order reference is unique per holder. |
| Refund | A failed or cancelled campaign refunds the original payment once, even if paused or approval was removed. |

The contract imports OpenZeppelin ERC20, SafeERC20, Ownable2Step, Pausable, ReentrancyGuard and Math. It uses pull claims/refunds and checks/effects/interactions. No loop over all supporters is needed when revenue arrives.

## Economics — an explicit change from the deck

The pitch gives the café working capital while promising a one-coffee floor. Software cannot back both with the same money. This starter reserves the base coffee price and releases only the premium as immediate growth capital:

- 1 contribution: **Rp37,500** in mock payment units.
- Reserved for one coffee: **Rp25,000**.
- Released to café on success: **Rp12,500**.
- 3,200 units: Rp120m collected, Rp80m reserved, Rp40m immediate growth funding.
- Sample Rp80m revenue report × 10% = Rp8m actually deposited to the contract.
- Rp8m ÷ Rp25,000 = 320 additional coffee credits.
- A backer of 10/3,200 original units receives 1 additional KM.

The reserve is paid to the café as coffee is redeemed. It is not a right to withdraw cash. It does not guarantee physical fulfillment, café survival, or the value of a future payment asset.

The reward calculation, in integer token units, is:

```text
totalRewardCredits += floor(depositedAllocation × 10^18 / coffeePrice)
entitled = floor(originalUnits × totalRewardCredits / successfulTotalUnits)
claimable = entitled − previouslyClaimedRewardCredits
```

Base credits and rewards use the same KM token. **Reward rights stay in a separate, fixed original-contribution ledger.** Redeeming KM does not erase those rights; reward KM does not compound them. Transfers and investment-right trading are deliberately disabled.

For a standard non-rebasing, exact-transfer payment token, retained principal plus revenue deposits cover issued and unclaimed beverage credits at the fixed price. Division rounds down, leaving dust in reserve. Unsupported incoming transfer amounts revert. Production must explicitly vet the settlement token; the contract cannot generally defend against a malicious asset, later rebases, freezes or changes in its economic value.

## Website → wallet → contract

The current page uses `dist/model.js` for a clearly labeled, session-only simulation. It is not a substitute for contract state. The real integration should replace its state transitions with wallet calls, using the compiled ABI:

```js
// Integration example, not wired into the demo.
const provider = new BrowserProvider(window.ethereum);
await provider.send('eth_requestAccounts', []);
const signer = await provider.getSigner();
const campaign = new Contract(campaignAddress, campaignAbi, signer);
const payment = new Contract(paymentAddress, paymentAbi, signer);
const cost = BigInt(units) * await campaign.contributionPrice();
await (await payment.approve(campaignAddress, cost)).wait();
await (await campaign.contribute(BigInt(units))).wait();
```

Verify chain ID, deployment addresses and bytecode before offering transactions. Show token approval separately from contribution; handle rejected signatures, allowance changes, pending/reverted transactions and chain/account changes. Refresh balances from confirmed chain reads; never increment a real balance optimistically after clicking a button. Format raw values with `formatUnits`, not floating-point money arithmetic.

Static HTML/CSS/ES modules are enough for this first client and can be delivered by a CDN. Onchain balances remain authoritative. For growth, add an event indexer and paginated API for history, a database for off-chain identity/order data, and a POS integration that processes each confirmed `(chainId, transactionHash, logIndex)` exactly once and handles reorganizations. None belongs in a first browser simulation.

## Limits to resolve before a pilot

- The contract has not been independently audited and is not approved for real funds.
- The owner both approves wallets and reports revenue; no identity provider or oracle is integrated. An evidence hash does not prove sales completeness or truth. Funded reports prove only that the matching allocation was deposited.
- Reporting is accepted only before `rewardEnd` (12 months in the example). There is no grace period for final sales reconciliation. Define eligible revenue, period dates and late-report handling before deployment.
- Claims and redemptions can be paused, and approval can be revoked. Successful holders have no onchain forced exit. Define oversight, pause limits, disputes and recovery. Failed refunds stay available.
- Whole-cup redemption leaves final fractions potentially unusable. Decide on top-ups, fractional purchases or terminal settlement. This starter provides none.
- A redemption reference is scoped to its holder, preventing another holder from consuming it. A production POS must authorize the holder, quantity, nonce, expiry, chain and contract address, then validate the confirmed redemption. A user-selected reference alone proves no actual order or fulfillment.
- There is no post-success cancellation/refund process for café closure, no fiat gateway, no tax handling, no governance or resale market. The terms must define who owes what if the café cannot perform.
- Browser tests cover the demo. Contract tests run transactions on an isolated local EVM with mock assets. Passing tests are not an audit.

## Path to release

1. Agree the first café, country, eligible revenue, beverage definition, reserve policy, closure policy and holder rights. A reward paid in coffee can still have a revenue-linked economic character; do not assume the denomination settles its legal classification.
2. For an Indonesia pilot, obtain jurisdiction-specific advice. The deck's OJK references are not evidence of approval. OJK has updated securities crowdfunding and digital-asset rules; determine which apply to the actual offering.
3. Choose an EVM testnet and settlement-token mock; deploy verified contracts, connect a wallet, and exercise refunds and POS redemption with a small invited pilot.
4. Integrate actual identity checks, independently reconcilable POS reporting, merchant-authorized redemption, multisig administration and monitoring. Complete a contract review/audit and resolve the limits above.
5. Separately publish the public website and activate a legally reviewed real-money campaign. This starter publishes only a private prototype; no blockchain deployment occurs automatically.

## Primary references

- [Solidity security considerations](https://docs.soliditylang.org/en/latest/security-considerations.html)
- [OpenZeppelin ERC-20 and SafeERC20](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20)
- [OpenZeppelin access control](https://docs.openzeppelin.com/contracts/5.x/access-control)
- [Ethereum oracles and their trust boundaries](https://ethereum.org/developers/docs/oracles/)
- [Ethereum scaling](https://ethereum.org/developers/docs/scaling/)
- [OJK: 2025 regulatory update including Securities Crowdfunding Regulation 17/2025](https://www.ojk.go.id/en/berita-dan-kegiatan/siaran-pers/Pages/Financial-Services-Sector-Stability-Maintained-Amid-Global-and-Domestic-Dynamics.aspx)
- [OJK: digital-asset trading amendments, POJK 23/2025](https://www.ojk.go.id/id/berita-dan-kegiatan/siaran-pers/Pages/POJK-23-Tahun-2025-Perubahan-POJK-27-Tahun-2024-Penyelenggaraan-Perdagangan-Aset-Keuangan-Digital-Termasuk-Aset-Kripto.aspx)
