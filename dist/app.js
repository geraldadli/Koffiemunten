import { TERMS, initialState, rewards, act } from './model.js';
const $ = selector => document.querySelector(selector);
const rupiah = amount => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount).replace('IDR', 'Rp').replace(/\s/g, '');
const credits = amount => Number(amount.toFixed(6)).toLocaleString('en-US', { maximumFractionDigits: 6 });
let state = initialState();
let toastTimer;
let reviewedQuantity;
function notify(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 6000); }
function perform(action, value) { try { state = act(state, action, value); render(); return true; } catch (error) { notify(error.message); return false; } }
function quantity() { return Number($('#quantity').value); }
function updateQuote() {
  const value = quantity();
  const valid = Number.isInteger(value) && value >= 1 && value <= 100;
  $('#order-total').textContent = valid ? rupiah(value * TERMS.price) : '—';
  $('#order-reserve').textContent = valid ? rupiah(value * TERMS.coffeePrice) : '—';
  $('#order-growth').textContent = valid ? rupiah(value * (TERMS.price - TERMS.coffeePrice)) : '—';
  const revenue = Number($('#revenue-slider').value);
  $('#revenue-label').textContent = rupiah(revenue);
  $('#example-units').textContent = valid ? value : '—';
  $('#example-reward').textContent = valid ? credits(revenue * .1 / TERMS.coffeePrice * value / TERMS.goalUnits) : '—';
  $('#example-formula').textContent = valid ? `${rupiah(revenue)} × 10% ÷ Rp25,000 × ${value} / 3,200` : 'Choose 1–100 whole coffee tokens.';
}
function render() {
  $('#connect').textContent = state.connected ? 'Demo wallet active ◈' : 'Try demo wallet ◈';
  $('#raised').textContent = rupiah(state.units * TERMS.price);
  $('#funding-progress').value = state.units * TERMS.price;
  $('#funded-percent').textContent = `${Math.round(state.units / TERMS.goalUnits * 100)}% funded`;
  $('#campaign-status').textContent = state.funded ? 'Demo campaign funded' : 'Demo funding round';
  $('#coffee-balance').textContent = credits(state.balance);
  $('#nav-count').textContent = credits(state.balance);
  $('#pending-credits').textContent = `${state.initialClaimed ? 0 : state.mine} KM`;
  $('#reward-credits').textContent = `${credits(rewards(state))} KM`;
  $('#balance-description').textContent = state.mine ? state.funded ? `${state.mine} original units keep earning for the reward term.` : `${state.mine} coffees reserved, awaiting campaign completion.` : 'Hold an order to start your coffee collection.';
  $('#claim').disabled = !state.funded || ((state.initialClaimed ? 0 : state.mine) + rewards(state) <= 0);
  $('#redeem').disabled = state.balance < 1;
  $('#contribute-button').disabled = state.funded || state.units === TERMS.goalUnits;
  $('#contribute-button').textContent = state.funded ? 'Campaign funded' : state.units === TERMS.goalUnits ? 'Campaign at capacity' : 'Hold my order';
  $('#finalize').disabled = state.funded; $('#report').disabled = !state.funded || state.reportCount > 0;
  $('#scenario-status').textContent = state.reportCount ? `Revenue recorded. Demo coffee reserve: ${rupiah(state.reserve)}.` : state.funded ? 'Campaign funded. You can now claim original coffee credits or report revenue.' : 'Funding is still open.';
  if (state.activity.length) {
    $('#activity').replaceChildren(...state.activity.map(item => {
      const row = document.createElement('li'), icon = document.createElement('span'), copy = document.createElement('div'), title = document.createElement('strong'), detail = document.createElement('p'), amount = document.createElement('span');
      icon.textContent = '◈'; title.textContent = item.title; detail.textContent = item.detail; amount.textContent = item.amount; amount.className = 'activity-amount'; copy.append(title, detail); row.append(icon, copy, amount); return row;
    }));
  }
  updateQuote();
}
$('#connect').addEventListener('click', () => { if (perform('connect')) notify('Demo account active. No external wallet is connected.'); });
$('#quantity').addEventListener('input', updateQuote);
$('#minus').addEventListener('click', () => { $('#quantity').value = Math.max(1, (quantity() || 1) - 1); updateQuote(); });
$('#plus').addEventListener('click', () => { $('#quantity').value = Math.min(100, (quantity() || 0) + 1); updateQuote(); });
$('#revenue-slider').addEventListener('input', updateQuote);
$('#contribution-form').addEventListener('submit', event => {
  event.preventDefault();
  if (state.funded || state.units + quantity() > TERMS.goalUnits) { notify('That order exceeds the remaining campaign capacity.'); return; }
  reviewedQuantity = quantity();
  $('#review-summary').textContent = `${reviewedQuantity} future lattes · ${rupiah(reviewedQuantity * TERMS.price)} total. ${rupiah(reviewedQuantity * TERMS.coffeePrice)} reserved for coffee; ${rupiah(reviewedQuantity * (TERMS.price - TERMS.coffeePrice))} released to the café only if funding succeeds.`;
  $('#review-dialog').showModal();
});
$('#confirm-contribution').addEventListener('click', () => { if (perform('contribute', reviewedQuantity)) { $('#review-dialog').close(); notify('Order held. Run the café scenario to complete funding and earn coffee rewards.'); } });
$('#scenario-button').addEventListener('click', () => $('#scenario-dialog').showModal());
$('#finalize').addEventListener('click', () => { if (perform('finalize')) notify('Demo campaign funded. Your original coffee credits are ready to claim.'); });
$('#report').addEventListener('click', () => { if (perform('report')) notify('Revenue allocation recorded. Claim your share in My coffee.'); });
$('#claim').addEventListener('click', () => { if (perform('claim')) notify('Credits claimed. A whole KM can now become a latte.'); });
$('#redeem').addEventListener('click', () => $('#redeem-dialog').showModal());
$('#confirm-redeem').addEventListener('click', () => { if (perform('redeem')) { $('#redeem-dialog').close(); notify('One demo latte redeemed. Your original reward entitlement stays intact.'); } });
const emptyActivity = $('#activity').firstElementChild.cloneNode(true);
$('#reset').addEventListener('click', () => { state = initialState(); $('#activity').replaceChildren(emptyActivity.cloneNode(true)); render(); notify('Demo reset. No real account or funds were changed.'); });
document.querySelectorAll('nav a').forEach(link => link.addEventListener('click', () => { document.querySelectorAll('nav a').forEach(item => item.classList.toggle('active', item === link)); }));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } }));
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  Promise.resolve(document.modelContext.registerTool({ name: 'open_coffee_scenario', description: 'Open the simulated café lifecycle controls. Does not submit a transaction or alter balances.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false }, execute(input) { if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw Error('Expected an empty object.'); if (!$('#scenario-dialog').open) $('#scenario-dialog').showModal(); return { opened: true, campaignFunded: state.funded, simulated: true }; } }, { signal: lifecycle.signal })).catch(() => {});
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
render();
