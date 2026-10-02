export const TERMS = Object.freeze({ price: 37500, coffeePrice: 25000, goalUnits: 3200, initialUnits: 2400, revenueBps: 1000 });
export function initialState() {
  return { connected: false, funded: false, units: TERMS.initialUnits, mine: 0, balance: 0, initialClaimed: false, rewardPool: 0, claimedRewards: 0, reserve: 0, reportCount: 0, redeemed: 0, activity: [] };
}
export function rewards(state) { return state.funded ? state.mine * state.rewardPool / state.units - state.claimedRewards : 0; }
// ponytail: number arithmetic is for this bounded, simulated IDR scenario only; onchain accounting uses uint256 and Math.mulDiv.
export function act(state, action, value) {
  const next = { ...state, activity: [...state.activity] };
  const add = (title, detail, amount) => next.activity.unshift({ title, detail, amount });
  switch (action) {
    case 'connect': next.connected = true; break;
    case 'contribute':
      if (state.funded) throw Error('The café reached its goal. Start the demo again to save more coffees.');
      if (!Number.isInteger(value) || value < 1 || value > 100 || state.units + value > TERMS.goalUnits) throw Error('Choose 1–100 coffees, up to the number still available.');
      next.connected = true; next.mine += value; next.units += value;
      add('Coffees saved', `${value} coffees for later · no payment taken`, `+${value} coffees pending`); break;
    case 'finalize':
      if (state.funded) throw Error('The café has already reached its goal.');
      next.funded = true; next.units = TERMS.goalUnits; next.reserve = next.units * TERMS.coffeePrice;
      add('Café goal reached', 'Other supporters helped the café reach its goal in this demo.', 'Goal reached'); break;
    case 'report':
      if (!state.funded) throw Error('Reach the café goal first.');
      if (state.reportCount) throw Error('These extra coffees have already been shared.');
      next.reportCount = 1; next.rewardPool = 8000000 / TERMS.coffeePrice; next.reserve += 8000000;
      add('Extra coffees shared', 'The café shared part of its sales with supporters.', '320 coffees shared'); break;
    case 'claim': {
      if (!state.funded) throw Error('Your coffees become available when the café reaches its goal.');
      const initial = state.initialClaimed ? 0 : state.mine;
      const reward = rewards(state);
      if (initial + reward <= 0) throw Error('There are no more coffees to collect.');
      next.balance += initial + reward; next.initialClaimed = true; next.claimedRewards += reward;
      add('Coffees ready to enjoy', `${initial} saved + ${Number(reward.toFixed(6))} extra coffees`, `+${Number((initial + reward).toFixed(6))} coffees`); break;
    }
    case 'redeem':
      if (!state.funded || state.balance < 1 || state.reserve < TERMS.coffeePrice) throw Error('You need one whole coffee ready to enjoy.');
      next.balance -= 1; next.reserve -= TERMS.coffeePrice; next.redeemed += 1;
      add('Coffee used', `Demo order #${String(next.redeemed).padStart(4, '0')} · practice only`, '−1 coffee'); break;
    default: throw Error('Unknown demo action.');
  }
  return next;
}
