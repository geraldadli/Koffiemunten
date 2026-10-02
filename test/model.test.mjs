import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, act, rewards } from '../dist/model.js';
test('demo follows funding → funded rewards → claim → redeem without duplicate claims', () => {
  let state = initialState();
  for (const invalid of [-1, 0, 1.5, 101, NaN]) assert.throws(() => act(state, 'contribute', invalid));
  assert.throws(() => act(state, 'claim'));
  state = act(state, 'contribute', 10); state = act(state, 'finalize');
  assert.equal(state.reserve, 80000000); assert.throws(() => act(state, 'contribute', 1));
  state = act(state, 'claim'); assert.equal(state.balance, 10);
  state = act(state, 'report'); assert.equal(rewards(state), 1); assert.equal(state.balance, 10); assert.throws(() => act(state, 'report'));
  // Funded but uncollected rewards must not count as spendable coffee.
  state = act(state, 'claim'); assert.equal(state.balance, 11); assert.equal(state.claimedRewards, 1); assert.throws(() => act(state, 'claim'));
  state = act(state, 'redeem'); assert.equal(state.balance, 10); assert.equal(state.mine, 10);
  assert.equal(state.reserve, 87975000); assert.equal(rewards(state), 0);
});

test('fractional rewards survive redemption; large balances remain accurate', () => {
  for (const units of [1, 4, 100]) {
    let state = act(initialState(), 'contribute', units);
    state = act(act(act(state, 'finalize'), 'claim'), 'report');
    state = act(state, 'redeem');
    assert.equal(rewards(state), units / 10); // Drinking does not change original support.
    state = act(state, 'claim');
    assert.equal(state.balance, units - 1 + units / 10);
    assert.ok(Math.abs(state.mine + state.claimedRewards - state.redeemed - state.balance) < 1e-9);
    assert.throws(() => act(state, 'claim')); // Collect cannot duplicate a reward.
    if (state.balance < 1) assert.throws(() => act(state, 'redeem'));
  }
});
