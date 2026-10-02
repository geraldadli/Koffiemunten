import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, act, rewards } from '../dist/model.js';
test('demo follows funding → funded rewards → claim → redeem without duplicate claims', () => {
  let state = initialState();
  for (const invalid of [-1, 0, 1.5, 101, NaN]) assert.throws(() => act(state, 'contribute', invalid));
  assert.throws(() => act(state, 'claim'));
  state = act(state, 'contribute', 10); state = act(state, 'finalize');
  assert.equal(state.reserve, 80000000); assert.throws(() => act(state, 'contribute', 1));
  state = act(state, 'report'); assert.equal(rewards(state), 1); assert.throws(() => act(state, 'report'));
  state = act(state, 'claim'); assert.equal(state.balance, 11); assert.throws(() => act(state, 'claim'));
  state = act(state, 'redeem'); assert.equal(state.balance, 10); assert.equal(state.mine, 10);
  assert.equal(state.reserve, 87975000); assert.equal(rewards(state), 0);
});
