import test from 'node:test';
import assert from 'node:assert/strict';
import { createHardhatRuntimeEnvironment } from 'hardhat/hre';
import { BrowserProvider, ContractFactory, id, MaxUint256, parseUnits } from 'ethers';
import { compileContracts } from '../scripts/compile.mjs';

const artifacts = compileContracts();
const money = n => parseUnits(String(n), 6);
const km = n => parseUnits(String(n), 18);
const send = async promise => (await promise).wait();

test('Solidity escrow, reserve, pro-rata rewards, redemption and failure protections', async t => {
  const hre = await createHardhatRuntimeEnvironment({ networks: { test: { type: 'edr-simulated', chainType: 'l1', hardfork: 'shanghai' } } });
  const connection = await hre.network.create('test');
  const rpc = connection.provider;
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 }); provider.pollingInterval = 10;
  t.after(async () => { provider.destroy(); await connection.close(); });
  const [admin, cafe, alice, bob, outsider] = await Promise.all([0, 1, 2, 3, 4].map(i => provider.getSigner(i)));
  const deploy = async (name, args) => {
    const result = await new ContractFactory(artifacts[name].abi, artifacts[name].bytecode, admin).deploy(...args);
    await result.waitForDeployment(); return result;
  };
  const asset = await deploy('MockIDR', []);
  const assetAddress = await asset.getAddress();
  const create = async (overrides = {}) => {
    const block = await provider.getBlock('latest');
    const terms = { coffeePrice: money(25000), contributionPrice: money(37500), goalUnits: 4, capUnits: 4, deadline: block.timestamp + 1000, rewardDuration: 365 * 86400, revenueBps: 1000, ...overrides };
    const campaign = await deploy('CoffeeCampaign', [admin.address, cafe.address, assetAddress, terms]);
    const address = await campaign.getAddress();
    for (const account of [alice, bob, admin]) {
      await send(asset.mint(account.address, money(1000000000)));
      await send(asset.connect(account).approve(address, MaxUint256));
      await send(campaign.setApproved(account.address, true));
    }
    return campaign;
  };

  const campaign = await create();
  const address = await campaign.getAddress();
  await assert.rejects(campaign.connect(outsider).contribute.staticCall(1));
  await assert.rejects(campaign.connect(alice).contribute.staticCall(0));
  await assert.rejects(campaign.connect(alice).claim.staticCall());
  await send(campaign.connect(alice).contribute(1));
  await assert.rejects(campaign.finalize.staticCall());
  await send(campaign.connect(bob).contribute(3));
  await assert.rejects(campaign.connect(bob).contribute.staticCall(1));
  assert.equal(await asset.balanceOf(cafe.address), 0n, 'café cannot take escrow');
  await send(campaign.connect(outsider).finalize());
  assert.equal(await campaign.phase(), 1n);
  assert.equal(await asset.balanceOf(cafe.address), money(50000));
  assert.equal(await asset.balanceOf(address), money(100000));
  await assert.rejects(campaign.finalize.staticCall());
  await assert.rejects(campaign.connect(alice).refund.staticCall());
  await assert.rejects(campaign.connect(alice).reportRevenue.staticCall(1, money(1000000), id('period-1')));
  await send(asset.approve(address, 0));
  await assert.rejects(campaign.reportRevenue.staticCall(1, money(1000000), id('unfunded')));
  assert.equal(await campaign.lastRevenuePeriod(), 0n, 'unfunded report cannot consume a period');
  assert.equal(await campaign.totalRewardCredits(), 0n, 'unfunded report cannot create liabilities');
  await send(asset.approve(address, MaxUint256));
  await send(campaign.reportRevenue(1, money(1000000), id('period-1')));
  assert.equal(await campaign.claimableRewards(alice.address), km(1));
  assert.equal(await campaign.claimableRewards(bob.address), km(3));
  await assert.rejects(campaign.reportRevenue.staticCall(1, money(1000000), id('period-1')));
  await assert.rejects(campaign.reportRevenue.staticCall(3, money(1000000), id('period-3')));
  await send(campaign.connect(alice).claim());
  assert.equal(await campaign.balanceOf(alice.address), km(2));
  await assert.rejects(campaign.connect(alice).claim.staticCall());
  await assert.rejects(campaign.connect(alice).transfer.staticCall(bob.address, km(1)));
  await assert.rejects(campaign.connect(alice).redeem.staticCall(3, id('too-many')));
  await send(campaign.connect(alice).redeem(1, id('alice-order-1')));
  assert.equal(await campaign.balanceOf(alice.address), km(1));
  assert.equal(await campaign.contributedUnits(alice.address), 1n, 'redemption preserves reward rights');
  assert.equal(await asset.balanceOf(address), money(175000));
  await assert.rejects(campaign.connect(alice).redeem.staticCall(1, id('alice-order-1')));
  await send(campaign.reportRevenue(2, money(1000000), id('period-2')));
  assert.equal(await campaign.claimableRewards(alice.address), km(1), 'no compounding or lost entitlement');
  await send(campaign.connect(alice).claim());
  await send(campaign.connect(bob).claim());
  assert.equal(await campaign.balanceOf(bob.address), km(9));
  assert.equal(await asset.balanceOf(address), money(275000));
  assert.equal(await campaign.totalSupply(), km(11));
  await send(campaign.connect(bob).redeem(1, id('alice-order-1')));
  assert.equal(await campaign.balanceOf(bob.address), km(8), 'other holders cannot consume your order reference');
  await send(campaign.setPaused(true));
  await assert.rejects(campaign.connect(alice).redeem.staticCall(1, id('paused-order')));
  await send(campaign.setPaused(false));
  await send(campaign.setApproved(alice.address, false));
  await assert.rejects(campaign.connect(alice).redeem.staticCall(1, id('revoked-order')));
  await send(campaign.setApproved(alice.address, true));

  await t.test('failed funding refunds exact deposit once, even when paused and approval revoked', async () => {
    const failed = await create({ goalUnits: 5, capUnits: 10 });
    const before = await asset.balanceOf(alice.address);
    await send(failed.connect(alice).contribute(2));
    await send(failed.setApproved(alice.address, false));
    await send(failed.setPaused(true));
    await rpc.request({ method: 'evm_increaseTime', params: [1100] });
    await rpc.request({ method: 'evm_mine', params: [] });
    await assert.rejects(failed.connect(bob).contribute.staticCall(1));
    await send(failed.connect(outsider).finalize());
    assert.equal(await failed.phase(), 2n);
    await send(failed.connect(alice).refund());
    assert.equal(await asset.balanceOf(alice.address), before);
    await assert.rejects(failed.connect(alice).refund.staticCall());
    await assert.rejects(failed.connect(alice).claim.staticCall());
  });
  await t.test('cancellation refunds and unauthorized administration fails', async () => {
    const cancelled = await create();
    await send(cancelled.connect(alice).contribute(1));
    await assert.rejects(cancelled.connect(outsider).cancel.staticCall());
    await assert.rejects(cancelled.connect(outsider).setApproved.staticCall(outsider.address, true));
    await assert.rejects(cancelled.renounceOwnership.staticCall());
    await send(cancelled.cancel());
    await send(cancelled.connect(alice).refund());
    assert.equal(await asset.balanceOf(await cancelled.getAddress()), 0n);
  });
  await t.test('fractional rewards stay solvent and later claims recover cumulative fractions', async () => {
    const fractional = await create({ goalUnits: 3, capUnits: 3 });
    await send(fractional.connect(alice).contribute(1));
    await send(fractional.connect(bob).contribute(2));
    await send(fractional.finalize());
    for (let period = 1; period <= 3; period++) {
      await send(fractional.reportRevenue(period, money(250000), id(`fraction-${period}`)));
      await send(fractional.connect(alice).claim());
    }
    await send(fractional.connect(bob).claim());
    assert.equal(await fractional.balanceOf(alice.address), km(2));
    assert.equal(await fractional.balanceOf(bob.address), km(4));
    assert.equal(await asset.balanceOf(await fractional.getAddress()), money(150000));
  });
  await t.test('reporting expires but existing credits remain redeemable', async () => {
    await rpc.request({ method: 'evm_increaseTime', params: [366 * 86400] });
    await rpc.request({ method: 'evm_mine', params: [] });
    await assert.rejects(campaign.reportRevenue.staticCall(3, money(1000000), id('late-report')));
    await send(campaign.connect(alice).redeem(1, id('late-redemption')));
    assert.equal(await campaign.balanceOf(alice.address), km(1));
  });
});
