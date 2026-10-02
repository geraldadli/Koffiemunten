import { TERMS, initialState, act, rewards } from './model.js';
const $ = selector => document.querySelector(selector);
const rupiah = amount => 'Rp' + amount.toLocaleString('en-US');
const coffees = amount => Number(amount.toFixed(6)).toLocaleString('en-US', { maximumFractionDigits: 6 });
const coffeeCount = amount => `${coffees(amount)} ${amount === 1 ? 'coffee' : 'coffees'}`;
let state = initialState(), toastTimer, reviewedQuantity;
function notify(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 6000); }
function perform(action, value) { try { state = act(state, action, value); render(); return true; } catch (error) { notify(error.message); return false; } }
const quantity = () => Number($('#quantity').value);
function updateQuote() {
  const value = quantity(), valid = Number.isInteger(value) && value >= 1 && value <= 100;
  $('#order-total').textContent = valid ? rupiah(value * TERMS.price) : '—';
  const revenue = Number($('#revenue-slider').value);
  $('#revenue-label').textContent = rupiah(revenue);
  $('#example-units').textContent = valid ? value : '—';
  $('#example-reward').textContent = valid ? coffees(revenue * TERMS.revenueBps / 10000 / TERMS.coffeePrice * value / TERMS.goalUnits) : '—';
}
function render() {
  $('#funding-progress').value = state.units * TERMS.price;
  $('#funded-percent').textContent = `${Math.round(state.units / TERMS.goalUnits * 100)}% of the goal`;
  $('#campaign-status').textContent = state.funded ? 'Goal reached' : 'Taking support';
  $('#coffee-balance').textContent = coffees(state.balance);
  $('#nav-count').textContent = coffees(state.balance);
  const available = Number(state.balance.toFixed(6)), pendingReward = rewards(state);
  $('#balance-description').textContent = state.mine ? state.funded ? `${coffeeCount(Math.floor(available))} you can use now.` : `${coffeeCount(state.mine)} saved. They unlock when the café reaches its goal.` : 'Save your first coffees to fill your pass.';
  $('#wallet-status').textContent = !state.mine ? 'Ready when you are' : !state.funded ? 'Waiting for the café' : available >= 1 ? 'Ready to sip' : available > 0 ? 'Part of your next cup' : 'Pass empty';
  $('#saved-label').textContent = state.funded ? 'Saved & unlocked' : 'Saved · waiting';
  $('#saved-coffees').textContent = coffees(state.mine);
  $('#earned-coffees').textContent = `+${coffees(state.claimedRewards)}`;
  $('#used-coffees').textContent = coffees(state.redeemed);
  $('#cup-shelf').replaceChildren(...Array.from({ length: Math.min(12, Math.max(6, Math.ceil(available))) }, (_, index) => {
    const cup = $('#cup-template').content.firstElementChild.cloneNode(true), fill = Math.max(0, Math.min(1, available - index));
    cup.classList.toggle('filled', fill > 0);
    cup.querySelector('.cup-liquid').setAttribute('y', 51 - fill * 25);
    cup.querySelector('.cup-liquid').setAttribute('height', fill * 25);
    return cup;
  }));
  $('#cup-key').textContent = available > 12 ? `12 cups shown · ${coffeeCount(available - 12)} more in your pass.` : available % 1 ? `${coffees(available % 1)} of a cup saved toward your next whole coffee.` : 'Each filled cup is one coffee. Empty cups are placeholders.';
  $('#reward-status').textContent = pendingReward > 0 ? 'Ready to collect' : state.reportCount ? 'Collected' : 'No share yet';
  $('#reward-card').classList.toggle('has-reward', pendingReward > 0);
  $('#reward-title').textContent = pendingReward > 0 ? 'Your café shared its sales.' : state.reportCount ? 'A little more in your cup.' : 'More coffee, on the café.';
  $('#reward-amount').textContent = state.reportCount ? `+${coffeeCount(pendingReward || state.claimedRewards)}` : 'Waiting to brew';
  $('#reward-description').textContent = pendingReward > 0 ? 'Your reward is set aside. Collect it to add it to your pass.' : state.reportCount ? 'Collected into your pass. Your share stays the same when you use a coffee.' : 'When the café shares its sales, your extra coffees appear here.';
  $('#reward-value').hidden = !state.reportCount;
  $('#reward-value').textContent = `${rupiah((pendingReward || state.claimedRewards) * TERMS.coffeePrice)} in coffee · not cash`;
  $('#claim-rewards').hidden = pendingReward <= 0;
  $('#claim-rewards').textContent = `Collect ${coffeeCount(pendingReward)}`;
  $('#distribution-details').hidden = !state.reportCount;
  $('#support-share').textContent = `${(state.mine / TERMS.goalUnits * 100).toLocaleString('en-US', { maximumFractionDigits: 5 })}% · ${state.mine} of ${TERMS.goalUnits.toLocaleString('en-US')}`;
  $('#distribution-result').textContent = coffeeCount(pendingReward + state.claimedRewards);
  $('#step-sales').classList.toggle('complete', !!state.reportCount);
  $('#step-collect').classList.toggle('complete', state.claimedRewards > 0);
  $('#step-enjoy').classList.toggle('complete', state.claimedRewards > 0);
  $('#advance').hidden = !state.mine || state.funded;
  $('#redeem').hidden = state.mine > 0 && !state.funded;
  $('#redeem').disabled = state.balance < 1;
  $('#next-hint').textContent = !state.mine ? 'Save a few coffees to get started.' : !state.funded ? 'Demo: reach the café goal and share sample sales.' : state.balance < 1 ? 'You need a whole coffee to use one.' : 'Use a whole coffee. Your right to future rewards stays.';
  $('#contribute-button').disabled = state.funded || state.units === TERMS.goalUnits;
  $('#contribute-button').textContent = state.funded ? 'Goal reached' : state.units === TERMS.goalUnits ? 'All coffees saved' : 'Save my coffees';
  $('#activity').replaceChildren(...state.activity.map(item => {
    const row = document.createElement('li'), copy = document.createElement('div'), title = document.createElement('strong'), detail = document.createElement('p'), amount = document.createElement('span');
    title.textContent = item.title; detail.textContent = item.detail; amount.textContent = item.amount; amount.className = 'activity-amount'; copy.append(title, detail); row.append(copy, amount); return row;
  }));
  if (!state.activity.length) { const empty = document.createElement('li'); empty.textContent = 'No coffees saved yet.'; $('#activity').append(empty); }
  updateQuote();
}
$('#quantity').addEventListener('input', updateQuote);
$('#minus').addEventListener('click', () => { $('#quantity').value = Math.max(1, (quantity() || 1) - 1); updateQuote(); });
$('#plus').addEventListener('click', () => { $('#quantity').value = Math.min(100, (quantity() || 0) + 1); updateQuote(); });
$('#revenue-slider').addEventListener('input', updateQuote);
$('#contribution-form').addEventListener('submit', event => {
  event.preventDefault();
  if (state.funded || state.units + quantity() > TERMS.goalUnits) { notify('There are fewer coffees left. Choose a smaller number.'); return; }
  reviewedQuantity = quantity();
  $('#review-summary').textContent = `${reviewedQuantity} ${reviewedQuantity === 1 ? 'coffee' : 'coffees'} · ${rupiah(reviewedQuantity * TERMS.price)}`;
  $('#review-dialog').showModal();
});
$('#confirm-contribution').addEventListener('click', () => { if (perform('contribute', reviewedQuantity)) { $('#review-dialog').close(); $('#wallet').scrollIntoView(); $('#advance').focus({ preventScroll: true }); notify('Coffees saved. Try the next step below.'); } });
$('#advance').addEventListener('click', () => {
  try {
    if (!state.mine) throw Error('Save a few coffees first.');
    state = act(act(act(state, 'finalize'), 'claim'), 'report');
    render(); $('#claim-rewards').focus(); notify('Your saved coffees are ready. A new demo reward is waiting to collect.');
  } catch (error) { notify(error.message); }
});
$('#claim-rewards').addEventListener('click', () => { const reward = rewards(state); if (perform('claim')) { $('#redeem').focus({ preventScroll: true }); notify(`${coffeeCount(reward)} added to your pass. Enjoy your café's thank you!`); } });
$('#redeem').addEventListener('click', () => $('#redeem-dialog').showModal());
$('#confirm-redeem').addEventListener('click', () => { if (perform('redeem')) { $('#redeem-dialog').close(); notify('One demo coffee used. Enjoy!'); } });
$('#reset').addEventListener('click', () => { state = initialState(); $('#distribution-details').open = false; render(); notify('Fresh start. Your demo has been reset.'); });
$('.small-link').addEventListener('click', () => { $('#price-details').open = true; });
$('#cash-help').addEventListener('click', () => { $('#cash-details').open = true; });
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } }));
render();
