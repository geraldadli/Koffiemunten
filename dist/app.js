import { TERMS, initialState, act } from './model.js';
const $ = selector => document.querySelector(selector);
const rupiah = amount => 'Rp' + amount.toLocaleString('en-US');
const coffees = amount => Number(amount.toFixed(6)).toLocaleString('en-US', { maximumFractionDigits: 6 });
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
  $('#balance-description').textContent = state.mine ? state.funded ? `${coffees(state.claimedRewards)} extra coffees received in this example.` : `${state.mine} coffees saved, waiting for the café's goal.` : 'Your saved coffees will appear here.';
  $('#advance').hidden = !state.mine || state.funded;
  $('#redeem').hidden = state.mine > 0 && !state.funded;
  $('#redeem').disabled = state.balance < 1;
  $('#next-hint').textContent = !state.mine ? 'Save a few coffees to get started.' : !state.funded ? 'Skip ahead in the demo to see your extra coffees.' : state.balance < 1 ? 'You need a whole coffee to use one.' : 'Use whole coffees. Extra portions add up.';
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
    state = act(act(act(state, 'finalize'), 'report'), 'claim');
    render(); $('#redeem').focus(); notify(`The café reached its goal! You received ${coffees(state.claimedRewards)} extra coffees in this demo.`);
  } catch (error) { notify(error.message); }
});
$('#redeem').addEventListener('click', () => $('#redeem-dialog').showModal());
$('#confirm-redeem').addEventListener('click', () => { if (perform('redeem')) { $('#redeem-dialog').close(); notify('One demo coffee used. Enjoy!'); } });
$('#reset').addEventListener('click', () => { state = initialState(); render(); notify('Fresh start. Your demo has been reset.'); });
$('.small-link').addEventListener('click', () => { $('#price-details').open = true; });
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } }));
render();
