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
      if (state.funded) throw Error('This campaign has closed. Reset the demo to contribute again.');
      if (!Number.isInteger(value) || value < 1 || value > 100 || state.units + value > TERMS.goalUnits) throw Error('Choose 1–100 tokens within the remaining campaign capacity.');
      next.connected = true; next.mine += value; next.units += value;
      add('Order held', `${value} future coffees · payment held in demo escrow`, `+${value} pending KM`); break;
    case 'finalize':
      if (state.funded) throw Error('The campaign has already closed.');
      next.funded = true; next.units = TERMS.goalUnits; next.reserve = next.units * TERMS.coffeePrice;
      add('Campaign funded', 'Sample supporters filled the target; growth capital released.', '100% funded'); break;
    case 'report':
      if (!state.funded) throw Error('Complete the campaign before reporting revenue.');
      if (state.reportCount) throw Error('This sample revenue period has already been reported.');
      next.reportCount = 1; next.rewardPool = 8000000 / TERMS.coffeePrice; next.reserve += 8000000;
      add('Revenue allocation deposited', 'Rp8m of a sample Rp80m report funds coffee rewards.', '+320 pool KM'); break;
    case 'claim': {
      if (!state.funded) throw Error('Coffee credits become available after successful funding.');
      const initial = state.initialClaimed ? 0 : state.mine;
      const reward = rewards(state);
      if (initial + reward <= 0) throw Error('No credits are available to claim.');
      next.balance += initial + reward; next.initialClaimed = true; next.claimedRewards += reward;
      add('Coffee credits claimed', `${initial} original + ${Number(reward.toFixed(6))} reward credits`, `+${Number((initial + reward).toFixed(6))} KM`); break;
    }
    case 'redeem':
      if (!state.funded || state.balance < 1 || state.reserve < TERMS.coffeePrice) throw Error('Claim at least 1 KM before redeeming a latte.');
      next.balance -= 1; next.reserve -= TERMS.coffeePrice; next.redeemed += 1;
      add('Latte redeemed', `Demo order #${String(next.redeemed).padStart(4, '0')} · Rp25,000 released to café`, '−1 KM'); break;
    default: throw Error('Unknown demo action.');
  }
  return next;
}
