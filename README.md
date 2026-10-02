# Koffiemunten

A wallet-connected **Sepolia demo** and executable Solidity starter for one café campaign. The website reads the deployed contracts and sends wallet-approved testnet transactions. No real payments or café orders are supported. The card's latte photo comes from the supplied pitch deck; the hero coffee artwork is AI-generated. Native CSS scroll animations respect reduced-motion preferences.

## Run it

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev
# Open http://127.0.0.1:4173
npm run compile
npm test
```

Open the site in a browser with MetaMask (or MetaMask's mobile browser), choose Connect wallet, and use your Sepolia account. The current campaign is already funded: existing supporters can collect and redeem; it cannot accept new contributions. Owner-only tools approve wallets and fund rewards from sample sales. Every write has a review popup, wallet-confirmation message, pending state, confirmed receipt link and error handling. A contribution or revenue report may need two transactions (exact token allowance, then the action). Refreshing does not reset onchain balances.

Deployed addresses (chain ID **11155111**), configured in `dist/chain.js`:

- MockIDR: `0x9E606024bF88170D37Fa01cbe34aC1Ee737bd102`
- CoffeeCampaign: `0x82Db1f5FA465Cbed6f9c7f9747a3932fa343450c`

“Practice money & café funds” separates the user's demo rupiah, test ETH fees, campaign reserve and treasury balance. Redeeming burns 1 KM and pays the café from the campaign reserve, never a second charge to the supporter's payment-token wallet. Network fees still use test ETH. Full history links to the explorer; the transaction list is explicitly this visit only.

## Deploy the website on Vercel

Import `geraldadli/Koffiemunten` in Vercel and deploy the `main` branch. Use the repository root (`.`), not a `site` subdirectory. The included `vercel.json` selects **Other** as the framework, skips dependency installation and building, and publishes **dist**. The static website has no runtime npm dependencies and needs no environment variables for this demo.

This publishes the wallet-connected frontend. The contracts are already deployed separately on Sepolia. Never put wallet private keys in browser code or public environment variables. The pinned ethers 6.17.0 browser bundle and MIT license are included in `dist/vendor`, so hosting needs no build, CDN script or paid RPC key. Refresh the bundle from the matching installed package if upgrading ethers.

For commercial use, choose Vercel Pro: Hobby is restricted to personal, non-commercial projects. See [Vercel build settings](https://vercel.com/docs/builds/configure-a-build) and [Hobby terms](https://vercel.com/docs/plans/hobby). The existing `.openai/hosting.json` remains available for Sites; it does not control Vercel deployments.

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

## Could supporters receive cash? Proposed next model, not implemented

**Today: coffee only.** `redeem()` burns coffee credits and pays the café treasury. It never pays the holder. Transfers are disabled. Only an unsuccessful/cancelled funding campaign offers a payment-asset refund; there is no successful-campaign cash exit. A displayed rupiah coffee value is not a cash balance, resale price, or profit.

For a cash-return product, use two balances rather than adding cash-out to every existing KM:

| Balance | What funds it | What the supporter can do |
| --- | --- | --- |
| Coffee pass | The original beverage reserve, plus any earnings converted into coffee | Redeem defined drinks; no automatic cash exit |
| Available earnings (proposed) | The café's actual revenue-allocation deposits | Withdraw through the chosen payout rail **or** convert into coffee, once |

The original support ledger continues to determine each person's share. Using drinks, collecting rewards or withdrawing earnings must not erase that share; new reward coffees must not acquire additional shares. A larger café valuation does not increase a coffee's redemption value or create equity ownership. The current campaign's revenue-reporting window is 12 months; later expansion is not an unlimited entitlement.

Example using the current illustrative terms: 10 original units cost Rp375,000. Rp250,000 backs the 10 drinks and Rp125,000 becomes café growth funding. A funded report of Rp80m sales allocates Rp8m across 3,200 original units. A 10-unit backer gets Rp25,000 of beverage value today. Under the proposed cash model, that **same** Rp25,000 could instead be available earnings, redeemable for one additional coffee or withdrawable before any fees/tax. It cannot fund both choices. This is not a returned Rp375,000 investment or proof of net profit. Ten percent more cups is not a 10% cash ROI.

Minimal future accounting, all in integer settlement-asset units:

```text
cumulativeAllocation += actualDeposit
entitlement = floor(originalUnits * cumulativeAllocation / successfulTotalUnits)
availableEarnings = entitlement - withdrawn - convertedToCoffee
```

The future contract must keep earned funds separate from the beverage reserve, consume entitlement before external transfers, and move backing into the beverage reserve when earnings are converted. It must reject double claims and never pay cash from backing still owed to drink holders. Terms must specify conversion rates, rounding, fees, minimum payouts, reward duration, failed payouts and closure. Already minted coffee-only rewards cannot gain cash rights merely through a UI change; they need an explicit migration and matching backing.

For an Indonesian pilot, evaluate regulated rupiah payment/payout providers and the appropriate crowdfunding route with qualified local counsel. OJK's POJK 17/2025 governs securities crowdfunding, while Bank Indonesia identifies rupiah as legal tender for domestic payments. This is a product design proposal, not a determination of classification or permission to launch. Calling a revenue-linked instrument a coffee receipt does not settle its classification. Sources: [OJK regulation](https://ojk.go.id/id/regulasi/Pages/POJK-17-Tahun-2025-Penawaran-Efek-Melalui-Layanan-Urun-Dana-Berbasis-Teknologi-Informasi.aspx), [Bank Indonesia](https://www.bi.go.id/en/publikasi/ruang-media/news-release/Pages/sp_232521.aspx).

A contract transfers its settlement asset, not bank rupiah by itself. Fiat withdrawal needs a reconciled payout service with unique payout IDs, a pending state, retry/reversal handling and authenticated settlement confirmation. Reporting still needs independently reconcilable sales records: a deposit proves funding, not the truth of the café's revenue. Confirm which sales/branches count and the sustainable sharing rate; the example's 10% of gross sales is not a tested business margin.

## Website → wallet → contract

The current page uses `dist/chain.js` with the wallet's EIP-1193 provider. `dist/model.js` remains as a standalone educational model tested locally; it is not loaded by the live website. The integration follows this flow:

```js
// Simplified illustration; the live adapter also checks chain/account and receipts.
const provider = new BrowserProvider(window.ethereum);
await provider.send('eth_requestAccounts', []);
const signer = await provider.getSigner();
const campaign = new Contract(campaignAddress, campaignAbi, signer);
const payment = new Contract(paymentAddress, paymentAbi, signer);
const cost = BigInt(units) * await campaign.contributionPrice();
await (await payment.approve(campaignAddress, cost)).wait();
await (await campaign.contribute(BigInt(units))).wait();
```

The adapter verifies Sepolia, deployed code presence, payment-token address, name and decimals when connecting. This compatibility check is not a byte-for-byte source verification or audit. Each write rechecks the active account/network; account and network changes clear the displayed pass. BigInt is used for transaction amounts; rounded numbers are display-only. Balances come from a consistent block and refresh after confirmed receipts and every 30 seconds while visible and idle. Failed/rejected transactions never create fake success or optimistic balances. Timeouts show the explorer link so users can check before retrying.

Static HTML/CSS/ES modules are enough for this testnet client. No private keys are handled by the website. Revenue evidence and redemption references are random, explicitly demo-only identifiers, not verified receipts or merchant authorizations. A production POS, real sales verification, indexing and cash payouts are not implemented. The wallet adapter is exercised against an isolated EVM in `npm test`, including allowance, claim, redemption accounting, account/network changes, rejected writes and repriced transactions.

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
