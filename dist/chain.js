import { BrowserProvider, Contract, ContractFactory, formatUnits, parseUnits, id, getAddress } from './vendor/ethers.min.js';

export const CONFIG = Object.freeze({
  chainId: 11155111n,
  campaign: '0x82Db1f5FA465Cbed6f9c7f9747a3932fa343450c',
  asset: '0x9E606024bF88170D37Fa01cbe34aC1Ee737bd102',
  explorer: 'https://sepolia.etherscan.io',
});
const TOKEN_ABI = [
  'function decimals() view returns (uint8)', 'function name() view returns (string)',
  'function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)',
  'function mint(address,uint256)', 'function approve(address,uint256) returns (bool)',
];
const CAMPAIGN_ABI = [
  ...['paymentToken', 'owner', 'treasury'].map(name => `function ${name}() view returns (address)`),
  ...['coffeePrice', 'contributionPrice', 'goalUnits', 'capUnits', 'deadline', 'rewardEnd', 'revenueBps', 'totalUnits', 'totalRewardCredits', 'lastRevenuePeriod'].map(name => `function ${name}() view returns (uint256)`),
  'function phase() view returns (uint8)', 'function paused() view returns (bool)',
  'function approved(address) view returns (bool)', 'function initialClaimed(address) view returns (bool)',
  ...['balanceOf', 'contributedUnits', 'claimedRewardCredits', 'claimableRewards'].map(name => `function ${name}(address) view returns (uint256)`),
  'function setApproved(address,bool)', 'function contribute(uint256)', 'function finalize()',
  'function claim()', 'function redeem(uint256,bytes32)', 'function refund()',
  'function reportRevenue(uint256,uint256,bytes32)',
];
export const cups = value => Number(formatUnits(value, 18));
export const money = value => Number(formatUnits(value, 6));
export { parseUnits, getAddress };

export async function assertSession(rpc, address) {
  const [chain, accounts] = await Promise.all([
    rpc.request({ method: 'eth_chainId' }), rpc.request({ method: 'eth_accounts' }),
  ]);
  if (BigInt(chain) !== CONFIG.chainId) throw Error('Switch your wallet to Sepolia, then reconnect. No real-money network is supported.');
  if (accounts[0]?.toLowerCase() !== address.toLowerCase()) throw Error('Your wallet account changed. Reconnect before continuing.');
}

export async function connectWallet(rpc, config = CONFIG) {
  if (!rpc) throw Error('Open this website in the browser where MetaMask is installed, or in the MetaMask mobile browser, then try again.');
  if (BigInt(await rpc.request({ method: 'eth_chainId' })) !== config.chainId) {
    await rpc.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] });
  }
  await rpc.request({ method: 'eth_requestAccounts' });
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 });
  try {
    const signer = await provider.getSigner(), address = await signer.getAddress();
    await assertSession(rpc, address);
    const campaign = new Contract(config.campaign, CAMPAIGN_ABI, signer);
    const token = new Contract(config.asset, TOKEN_ABI, signer);
    const [campaignCode, tokenCode, asset, decimals, name] = await Promise.all([
      provider.getCode(config.campaign), provider.getCode(config.asset), campaign.paymentToken(), token.decimals(), token.name(),
    ]);
    if (campaignCode === '0x' || tokenCode === '0x' || asset.toLowerCase() !== config.asset.toLowerCase() || decimals !== 6n || name !== 'Demo Rupiah') {
      throw Error('The demo contracts could not be verified. No transaction was sent.');
    }
    return { rpc, provider, signer, address, campaign, token, config };
  } catch (error) { provider.destroy(); throw error; }
}

export async function readWallet(session) {
  await assertSession(session.rpc, session.address);
  const { provider, campaign, token, address, config } = session;
  const block = await provider.getBlock('latest');
  const at = { blockTag: block.number };
  const fields = ['owner', 'treasury', 'coffeePrice', 'contributionPrice', 'goalUnits', 'capUnits', 'deadline', 'rewardEnd', 'revenueBps', 'totalUnits', 'totalRewardCredits', 'lastRevenuePeriod', 'phase', 'paused'];
  const values = await Promise.all(fields.map(name => campaign[name](at)));
  const result = Object.fromEntries(fields.map((name, i) => [name, values[i]]));
  const userFields = ['approved', 'initialClaimed', 'balanceOf', 'contributedUnits', 'claimedRewardCredits', 'claimableRewards'];
  const userValues = await Promise.all(userFields.map(name => campaign[name](address, at)));
  Object.assign(result, Object.fromEntries(userFields.map((name, i) => [name, userValues[i]])));
  [result.cash, result.reserve, result.treasuryBalance, result.eth] = await Promise.all([
    token.balanceOf(address, at), token.balanceOf(config.campaign, at), token.balanceOf(result.treasury, at), provider.getBalance(address, block.number),
  ]);
  result.now = BigInt(block.timestamp);
  result.isOwner = result.owner.toLowerCase() === address.toLowerCase();
  result.initial = result.phase === 1n && !result.initialClaimed ? result.contributedUnits * 10n ** 18n : 0n;
  result.claimable = result.initial + result.claimableRewards;
  result.used = (result.initialClaimed ? result.contributedUnits * 10n ** 18n : 0n) + result.claimedRewardCredits - result.balanceOf;
  await assertSession(session.rpc, address);
  return result;
}

// Every write shares the same network/account check and confirmed-receipt lifecycle.
export async function sendTransaction(session, title, submit, update) {
  await assertSession(session.rpc, session.address);
  update({ stage: 'wallet', title, message: 'Confirm in your wallet. The network fee uses Sepolia test ETH.' });
  let tx;
  try {
    tx = await submit();
    update({ stage: 'pending', title, hash: tx.hash, message: 'Sent to Sepolia. Waiting for your receipt…' });
    let receipt;
    try { receipt = await tx.wait(1, 180000); }
    catch (error) {
      if (error.code === 'TRANSACTION_REPLACED' && !error.cancelled && error.reason === 'repriced') receipt = error.receipt;
      else throw error;
    }
    if (!receipt || receipt.status !== 1) throw Error('The transaction did not complete. Check its receipt before trying again.');
    update({ stage: 'confirmed', title, hash: receipt.hash, message: 'Confirmed on Sepolia.' });
    return receipt;
  } catch (error) {
    error.transactionHash = error.receipt?.hash || tx?.hash;
    throw error;
  }
}

export async function ensureAllowance(session, amount, update) {
  const allowance = await session.token.allowance(session.address, session.config.campaign);
  if (allowance < amount) {
    await sendTransaction(session, 'Allow demo rupiah', () => session.token.approve(session.config.campaign, amount), update);
  }
}

export async function selectCampaign(session, address) {
  await assertSession(session.rpc, session.address);
  address = getAddress(address);
  const campaign = new Contract(address, CAMPAIGN_ABI, session.signer);
  if ((await campaign.paymentToken()).toLowerCase() !== session.config.asset.toLowerCase()) throw Error('This café uses a different payment token. Choose another demo.');
  return { ...session, campaign, config: { ...session.config, campaign: address } };
}

export async function createDemo(session, artifact, update) {
  await assertSession(session.rpc, session.address);
  const block = await session.provider.getBlock('latest');
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, session.signer);
  const terms = [parseUnits('25000', 6), parseUnits('37500', 6), 10, 10, block.timestamp + 30 * 86400, 365 * 86400, 1000];
  const receipt = await sendTransaction(session, 'Create fresh demo café', async () => {
    const deployed = await factory.deploy(session.address, session.address, session.config.asset, terms);
    return deployed.deploymentTransaction();
  }, update);
  if (!receipt.contractAddress) throw Error('The deployment receipt has no café address. Check the receipt before creating another.');
  return receipt.contractAddress;
}

export function receiptReference() { return id(`demo-coffee:${crypto.randomUUID()}`); }

export function friendlyError(error) {
  const code = error.code ?? error.info?.error?.code;
  const raw = error.reason || error.shortMessage || error.message || '';
  if (code === 'ACTION_REJECTED' || code === 4001 || error.info?.error?.code === 4001) return 'You cancelled in your wallet. This step was not completed. Any earlier confirmed steps still count.';
  if (code === 'INSUFFICIENT_FUNDS' || /insufficient funds/i.test(raw)) return 'You need a little Sepolia test ETH for the network fee. Get it from the free faucet; do not buy real ETH.';
  if (code === 'TIMEOUT' || (error.transactionHash && !error.receipt && code !== 'TRANSACTION_REPLACED')) return 'We could not confirm the result yet. Check the transaction link before trying again, then refresh your balance.';
  if (code === 'TRANSACTION_REPLACED') return 'This transaction was cancelled or replaced in your wallet. Check the receipt, then refresh your balance.';
  if (code === 4902 || error.info?.error?.code === 4902) return 'Enable Sepolia in your wallet’s test networks, then reconnect.';
  if (/Wallet not approved/.test(raw)) return 'The café owner needs to approve this wallet before it can participate.';
  if (/paused/i.test(raw)) return 'The café has paused this action. Please try again later.';
  if (code === 'CALL_EXCEPTION') return 'The contract could not complete this action. Refresh your balance and check the campaign status before trying again.';
  if (/network|fetch|RPC/i.test(raw)) return 'We could not reach Sepolia. Check your connection and wallet network, then try again.';
  return raw.slice(0, 240) || 'Something went wrong. No success was recorded; refresh and check your wallet.';
}
