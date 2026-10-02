import { CONFIG, connectWallet, readWallet, sendTransaction, ensureAllowance, cups, money, parseUnits, getAddress, receiptReference, friendlyError, createDemo, selectCampaign } from './chain.js';
const $ = selector => document.querySelector(selector);
const rupiah = amount => 'Rp' + amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
const number = amount => amount.toLocaleString('en-US', { maximumFractionDigits: 6 });
const coffeeCount = amount => `${number(amount)} ${amount === 1 ? 'coffee' : 'coffees'}`;
const short = address => `${address.slice(0, 6)}…${address.slice(-4)}`;
let session, snapshot, busy = false, revision = 0, reviewAction;
const campaignBooks = new Map();
let storageUnavailable = false;
function campaignBook(address) {
  const key = address.toLowerCase();
  if (!campaignBooks.has(key)) {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(`koffie-campaigns:${key}`)); } catch { /* A new device starts at the original café. */ }
    const valid = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value);
    const list = Array.isArray(saved?.list) ? saved.list.filter(valid) : [];
    campaignBooks.set(key, { list, active: valid(saved?.active) && list.includes(saved.active) ? saved.active : CONFIG.campaign });
  }
  return campaignBooks.get(key);
}
function saveCampaignBook(address, book) {
  campaignBooks.set(address.toLowerCase(), book);
  try { localStorage.setItem(`koffie-campaigns:${address.toLowerCase()}`, JSON.stringify(book)); }
  catch { storageUnavailable = true; }
}
async function activateCampaign(current, address) {
  const version = revision, next = await selectCampaign(current, address), data = await readWallet(next);
  if (version !== revision || session !== current) throw Error('Your wallet changed. Reconnect to load the new café.');
  session = next; snapshot = data;
  const book = campaignBook(current.address); book.active = address; saveCampaignBook(current.address, book);
  render();
  return next;
}
const providers = new Map();
window.addEventListener('eip6963:announceProvider', event => {
  if (event.detail?.info?.rdns && event.detail?.provider?.request) providers.set(event.detail.info.rdns, event.detail.provider);
});
window.dispatchEvent(new Event('eip6963:requestProvider'));
const injected = () => providers.get('io.metamask') || window.ethereum?.providers?.find(p => p.isMetaMask) || window.ethereum || providers.values().next().value;
const quantity = () => Number($('#quantity').value);
const dialog = $('#transaction-dialog');

function popup(title, message, stage = 'Review') {
  $('#transaction-title').textContent = title;
  $('#transaction-message').textContent = message;
  $('#transaction-stage').textContent = stage;
  if (!dialog.open) dialog.showModal();
}
function resetPopup() {
  $('#transaction-steps').replaceChildren();
  $('#transaction-link').hidden = true;
  $('#transaction-confirm').hidden = true;
  $('#transaction-done').hidden = true;
  $('#transaction-close').disabled = false;
}
function review(title, message, action) {
  if (busy) return;
  resetPopup(); reviewAction = action; $('#transaction-confirm').hidden = false;
  popup(title, message);
}
function showReceipt(hash) {
  $('#transaction-link').href = `${CONFIG.explorer}/tx/${hash}`;
  $('#transaction-link').hidden = false;
}
function showError(error) {
  popup('Let’s check that', friendlyError(error), 'Needs attention');
  if (error.transactionHash) showReceipt(error.transactionHash);
  $('#transaction-confirm').hidden = true; $('#transaction-done').hidden = false;
}
function updateTransaction(event) {
  popup(event.title, event.message, { wallet: 'Confirm in your wallet', pending: 'Waiting for Sepolia', confirmed: 'Confirmed' }[event.stage]);
  if (event.stage === 'wallet') $('#transaction-link').hidden = true;
  if (event.hash) showReceipt(event.hash);
  if (event.stage === 'confirmed') {
    const item = document.createElement('li'), link = document.createElement('a');
    link.href = `${CONFIG.explorer}/tx/${event.hash}`; link.target = '_blank'; link.rel = 'noopener';
    link.textContent = `${event.title} · confirmed`; item.append(link); $('#transaction-steps').append(item);
    if ($('#activity').dataset.started !== 'true') { $('#activity').replaceChildren(); $('#activity').dataset.started = 'true'; }
    $('#activity').prepend(item.cloneNode(true));
  }
}
async function run(action) {
  if (busy) return;
  busy = true; $('#transaction-confirm').hidden = true; $('#transaction-close').disabled = true;
  render();
  try {
    const message = await action();
    let warning = '';
    if (session) {
      try { await refresh(); }
      catch { snapshot = undefined; warning = ' Your balance could not refresh. Reconnect to check it; do not repeat a confirmed transaction.'; }
    }
    popup('All done', message + warning, 'Complete');
  } catch (error) { showError(error); }
  finally { busy = false; reviewAction = undefined; $('#transaction-close').disabled = false; $('#transaction-done').hidden = false; render(); }
}
$('#transaction-confirm').addEventListener('click', () => { if (reviewAction) run(reviewAction); });
$('#transaction-done').addEventListener('click', () => dialog.close());
dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
dialog.addEventListener('close', () => { reviewAction = undefined; });

function disconnected() {
  revision++; session = undefined; snapshot = undefined;
  $('#connection-error').hidden = false;
  $('#connection-error').textContent = 'Your wallet or network changed. Reconnect to load the correct coffee pass.';
  if (!busy) dialog.close();
  render();
}
const observed = new WeakSet();
async function connect() {
  if (busy) return;
  resetPopup(); busy = true; render(); $('#transaction-close').disabled = true;
  popup('Connect your coffee pass', 'Open your wallet and allow this website to see your account. Connection is free.', 'Waiting for wallet');
  const rpc = injected();
  try {
    if (rpc?.on && !observed.has(rpc)) {
      rpc.on('accountsChanged', disconnected); rpc.on('chainChanged', disconnected); rpc.on('disconnect', disconnected); observed.add(rpc);
    }
    let connected = await connectWallet(rpc);
    const version = ++revision, book = campaignBook(connected.address);
    let restored = true;
    if (book.active !== CONFIG.campaign) {
      try { connected = await selectCampaign(connected, book.active); await readWallet(connected); }
      catch { connected = await selectCampaign(connected, CONFIG.campaign); book.active = CONFIG.campaign; restored = false; }
    }
    const data = await readWallet(connected);
    if (version !== revision) { connected.provider.destroy(); throw Error('Your wallet changed while connecting. Please connect again.'); }
    session = connected; snapshot = data; $('#connection-error').hidden = true;
    popup('Your coffee pass is connected', restored ? 'Your balance comes directly from Sepolia. Start a fresh demo to try the full journey.' : 'Your saved demo was unavailable. The original café is selected; you can retry using Your campaigns.', 'Connected');
  } catch (error) { session = undefined; snapshot = undefined; showError(error); }
  finally { busy = false; $('#transaction-close').disabled = false; $('#transaction-done').hidden = false; render(); }
}
$('#connect').addEventListener('click', connect);
$('#connect-pass').addEventListener('click', connect);
async function refresh() {
  if (!session) return;
  const current = session, version = revision, data = await readWallet(current);
  if (version !== revision || current !== session) throw Error('Your wallet changed. Reconnect before continuing.');
  snapshot = data; $('#connection-error').hidden = true; render();
}
$('#refresh').addEventListener('click', () => {
  resetPopup(); run(async () => { await refresh(); return 'Your coffee pass is up to date.'; });
});
// Poll only while visible and idle; balances are never updated optimistically.
setInterval(async () => {
  if (!session || busy || dialog.open || document.hidden) return;
  try { await refresh(); }
  catch { snapshot = undefined; $('#connection-error').hidden = false; $('#connection-error').textContent = 'Balance unavailable. Reconnect before making a transaction.'; render(); }
}, 30000);

function updateQuote() {
  const n = quantity(), valid = Number.isSafeInteger(n) && n > 0 && n <= 100;
  $('#order-total').textContent = valid && snapshot ? rupiah(money(snapshot.contributionPrice) * n) : '—';
  const revenue = Number($('#revenue-slider').value);
  $('#revenue-label').textContent = rupiah(revenue);
  $('#example-units').textContent = valid ? n : '—';
  $('#example-reward').textContent = valid && snapshot && n <= Number(snapshot.capUnits) ? number(revenue * Number(snapshot.revenueBps) / 10000 / money(snapshot.coffeePrice) * n / Number(snapshot.goalUnits)) : '—';
  const sales = Number($('#sales-amount').value);
  $('#sales-quote').textContent = snapshot && Number.isSafeInteger(sales) && sales > 0 ? `${rupiah(sales * Number(snapshot.revenueBps) / 10000)} moves from the owner wallet into the coffee reserve.` : 'Enter a whole demo rupiah amount.';
}
function render() {
  const s = snapshot, ready = !!session && !!s, available = ready ? cups(s.balanceOf) : 0;
  $('#new-demo').disabled = busy;
  $('#campaign-picker').disabled = busy || !ready;
  const book = session ? campaignBook(session.address) : { list: [] };
  const choices = [CONFIG.campaign, ...book.list.filter(address => address !== CONFIG.campaign)];
  $('#campaign-picker').replaceChildren(...choices.map((address, index) => {
    const option = document.createElement('option'); option.value = address;
    option.textContent = index ? `Practice café ${index} · ${short(address)}` : 'Original café';
    option.selected = address.toLowerCase() === (session?.config.campaign || CONFIG.campaign).toLowerCase(); return option;
  }));
  $('#active-campaign-link').href = `${CONFIG.explorer}/address/${session?.config.campaign || CONFIG.campaign}`;
  $('#demo-guide').textContent = !ready ? 'Connect your wallet, then start a fresh 10-coffee demo. Repeat whenever you like.' : s.phase === 1n ? 'This café is funded. Collect, share rewards and use a coffee—or start again with a fresh café.' : s.phase === 2n ? 'This campaign ended. Request your refund or start a fresh café.' : !s.approved ? 'Next: enable your demo wallet to join this café.' : s.totalUnits === s.capUnits ? 'All 10 coffees funded! Next: Finish funding in your coffee pass.' : 'Get practice money, save 10 coffees, then finish funding. You play both supporter and café owner.';
  $('#enable-wallet').hidden = !ready || !s.isOwner || s.approved;
  $('#enable-wallet').disabled = busy;
  $('#connect').textContent = ready ? short(session.address) : 'Connect wallet';
  $('#connect-pass').hidden = ready;
  $('#connection-status').textContent = ready ? 'Connected to Sepolia · test money only' : 'Connect your wallet to see your coffee pass.';
  $('#wallet-address').textContent = ready ? session.address : 'Use the same account you used in Remix.';
  $('#nav-count').textContent = $('#coffee-balance').textContent = ready ? number(available) : '—';
  $('#unit-price').textContent = ready ? `${rupiah(money(s.contributionPrice))} demo rupiah per coffee` : 'Connect to see the coffee price';
  $('#funding-progress').value = ready ? Math.min(100, Number(s.totalUnits) / Number(s.goalUnits) * 100) : 0;
  $('#funded-percent').textContent = ready ? `${s.totalUnits} of ${s.goalUnits} coffees funded` : 'Live progress after connecting';
  $('#campaign-status').textContent = !ready ? 'Connect to check' : s.phase === 1n ? 'Goal reached' : s.phase === 2n ? 'Funding ended' : s.now >= s.deadline || s.totalUnits === s.capUnits ? 'Ready to finish' : 'Taking support';
  $('#balance-description').textContent = !ready ? 'Your coffee tickets will appear here after you connect.' : s.phase === 0n ? `${s.contributedUnits} coffees saved. Collect them if the campaign succeeds.` : `${coffeeCount(Math.floor(available))} you can use now.`;
  $('#wallet-status').textContent = !ready ? 'Not connected' : s.paused ? 'Café paused' : !s.approved ? 'Approval needed' : available >= 1 ? 'Ready to sip' : 'Waiting to brew';
  $('#saved-coffees').textContent = ready ? String(s.contributedUnits) : '—';
  $('#saved-label').textContent = ready && s.initialClaimed ? 'Saved & collected' : 'Original support';
  $('#earned-coffees').textContent = ready ? `+${number(cups(s.claimedRewardCredits))}` : '—';
  $('#used-coffees').textContent = ready ? number(cups(s.used)) : '—';
  $('#cup-shelf').replaceChildren(...Array.from({ length: Math.min(12, Math.max(6, Math.ceil(available))) }, (_, index) => {
    const cup = $('#cup-template').content.firstElementChild.cloneNode(true), fill = Math.max(0, Math.min(1, available - index));
    cup.classList.toggle('filled', fill > 0); cup.querySelector('.cup-liquid').setAttribute('y', 51 - fill * 25); cup.querySelector('.cup-liquid').setAttribute('height', fill * 25); return cup;
  }));
  $('#cup-key').textContent = available > 12 ? `12 shown · ${coffeeCount(available - 12)} more in your pass.` : 'Each filled cup is one coffee. Empty cups are placeholders.';
  const pending = ready ? cups(s.claimableRewards) : 0, initial = ready ? cups(s.initial) : 0;
  $('#reward-card').classList.toggle('has-reward', pending + initial > 0);
  $('#reward-status').textContent = pending + initial > 0 ? 'Ready to collect' : 'No coffees waiting';
  $('#reward-title').textContent = initial ? 'Your first coffees are ready.' : 'More coffee, on the café.';
  $('#reward-amount').textContent = pending + initial > 0 ? coffeeCount(pending + initial) : ready && s.claimedRewardCredits > 0n ? `+${coffeeCount(cups(s.claimedRewardCredits))} collected` : 'Waiting to brew';
  $('#reward-description').textContent = initial ? `${coffeeCount(initial)} from your support, plus ${coffeeCount(pending)} in rewards. Collect them into your pass.` : pending ? 'The café funded your reward. Collect it into your pass.' : 'When the café funds extra coffees, they appear here.';
  $('#reward-value').hidden = !pending;
  $('#reward-value').textContent = ready ? `${rupiah(pending * money(s.coffeePrice))} in coffee · not cash` : '';
  $('#claim-rewards').hidden = pending + initial <= 0;
  $('#claim-rewards').textContent = `Collect ${coffeeCount(pending + initial)}`;
  $('#claim-rewards').disabled = busy || !ready || !s.approved || s.paused;
  $('#distribution-details').hidden = !ready || s.lastRevenuePeriod === 0n;
  $('#report-count').textContent = ready ? String(s.lastRevenuePeriod) : '0';
  $('#support-share').textContent = ready && s.totalUnits > 0n ? `${number(Number(s.contributedUnits) / Number(s.totalUnits) * 100)}%` : '0%';
  $('#distribution-result').textContent = ready ? coffeeCount(pending + cups(s.claimedRewardCredits)) : '—';
  $('#step-sales').classList.toggle('complete', ready && s.lastRevenuePeriod > 0n);
  $('#step-collect').classList.toggle('complete', ready && s.claimedRewardCredits > 0n);
  $('#step-enjoy').classList.toggle('complete', ready && available > 0);
  $('#redeem').disabled = busy || !ready || !s.approved || s.paused || s.phase !== 1n || s.balanceOf < 10n ** 18n;
  $('#finalize').hidden = !ready || s.phase !== 0n || (s.totalUnits !== s.capUnits && s.now < s.deadline);
  $('#finalize').disabled = busy;
  $('#refund').hidden = !ready || s.phase !== 2n || s.contributedUnits === 0n;
  $('#refund').disabled = busy;
  $('#next-hint').textContent = !ready ? 'Connect to see your coffees.' : !s.approved ? 'The café owner must approve this wallet to collect or use coffees.' : s.paused ? 'Café actions are paused. Failed-campaign refunds remain available.' : 'Using a coffee spends one ticket. The campaign pays the café; you only pay the test network fee.';
  const funding = ready && s.phase === 0n && s.now < s.deadline && s.totalUnits < s.capUnits;
  $('#contribute-button').disabled = busy || !funding || !s.approved || s.paused;
  $('#contribute-button').textContent = !ready ? 'Connect wallet first' : s.phase === 1n ? 'This café is fully funded' : !funding ? 'Funding closed' : 'Save my coffees';
  $('#funding-hint').textContent = ready && s.phase === 1n ? 'Start a fresh demo above to test funding again.' : ready && !s.approved ? s.isOwner ? 'Enable your demo wallet to begin.' : 'Ask the café owner to approve your wallet first.' : '';
  for (const id of ['connect', 'connect-pass']) $(`#${id}`).disabled = busy;
  for (const id of ['refresh', 'mint']) $(`#${id}`).disabled = busy || !ready;
  $('#demo-balance').textContent = ready ? rupiah(money(s.cash)) : '—';
  $('#reserve-balance').textContent = ready ? rupiah(money(s.reserve)) : '—';
  $('#treasury-balance').textContent = ready ? rupiah(money(s.treasuryBalance)) : '—';
  $('#eth-balance').textContent = ready ? `${number(cups(s.eth))} test ETH` : '—';
  $('#treasury-note').textContent = ready && s.treasury.toLowerCase() === session.address.toLowerCase() ? 'You are also the café in this demo. When you use a coffee, your wallet receives its reserve payment.' : 'When you use a coffee, the campaign sends its reserve payment to the café—not from your wallet.';
  $('#treasury-link').hidden = $('#wallet-link').hidden = !ready;
  if (ready) { $('#treasury-link').href = `${CONFIG.explorer}/address/${s.treasury}`; $('#wallet-link').href = `${CONFIG.explorer}/address/${session.address}`; }
  $('#owner-panel').hidden = !ready || !s.isOwner;
  $('#approval-form button').disabled = busy || !ready || !s.isOwner;
  $('#share-sales').disabled = busy || !ready || !s.isOwner || s.paused || s.phase !== 1n || s.now >= s.rewardEnd;
  updateQuote();
}

async function activeSession() {
  if (!session) throw Error('Connect your wallet first.');
  await refresh();
  if (!snapshot) throw Error('Refresh your wallet before continuing.');
  return session;
}
$('#new-demo').addEventListener('click', () => {
  if (!session || !snapshot) { connect(); return; }
  review('Start a fresh demo?', 'Create your own 10-coffee café, then enable your wallet. Confirm two transactions in MetaMask using free Sepolia test ETH. You play both supporter and café. Previous campaigns remain available in Your campaigns.', async () => {
    const current = await activeSession();
    const response = await fetch('./contracts/CoffeeCampaign.json');
    if (!response.ok) throw Error('The demo setup could not load. Refresh and try again.');
    const address = await createDemo(current, await response.json(), updateTransaction);
    // Save the confirmed address BEFORE optional approval, so cancelling step two is recoverable.
    const book = campaignBook(current.address);
    if (!book.list.includes(address)) book.list.push(address);
    book.active = address; saveCampaignBook(current.address, book);
    const next = await activateCampaign(current, address);
    $('#quantity').value = '10';
    await sendTransaction(next, 'Enable my demo wallet', () => next.campaign.setApproved(next.address, true), updateTransaction);
    return 'Your fresh café is ready: 0 of 10 coffees funded. Get practice money if needed, then Save my coffees.' + (storageUnavailable ? ' Browser storage is unavailable; save the café address from View active café before closing this page.' : ' It will be remembered in this browser.');
  });
});
$('#campaign-picker').addEventListener('change', () => {
  const address = $('#campaign-picker').value;
  resetPopup();
  run(async () => { const current = await activeSession(); await activateCampaign(current, address); return 'Campaign switched. Your coffee pass now shows this café only.'; });
});
$('#enable-wallet').addEventListener('click', () => review('Enable your demo wallet?', 'Allow your wallet to save, collect and use coffees in this practice café. No demo rupiah moves.', async () => {
  const current = await activeSession();
  await sendTransaction(current, 'Enable my demo wallet', () => current.campaign.setApproved(current.address, true), updateTransaction);
  return 'Your wallet is enabled. You can now save coffees.';
}));
$('#quantity').addEventListener('input', updateQuote);
$('#minus').addEventListener('click', () => { $('#quantity').value = Math.max(1, (quantity() || 1) - 1); updateQuote(); });
$('#plus').addEventListener('click', () => { $('#quantity').value = Math.min(100, (quantity() || 0) + 1); updateQuote(); });
$('#revenue-slider').addEventListener('input', updateQuote);
$('#sales-amount').addEventListener('input', updateQuote);
$('#mint').addEventListener('click', () => review('Get practice money?', 'Add 1,000,000 demo rupiah to your connected wallet. It has no cash value.', async () => {
  const s = await activeSession(); await sendTransaction(s, 'Get practice money', () => s.token.mint(s.address, parseUnits('1000000', 6)), updateTransaction);
  return '1,000,000 demo rupiah added to your wallet.';
}));
$('#contribution-form').addEventListener('submit', event => {
  event.preventDefault(); if (!snapshot) return;
  const units = quantity();
  if (!Number.isSafeInteger(units) || units < 1 || units > 100 || BigInt(units) > snapshot.capUnits - snapshot.totalUnits) { resetPopup(); showError(Error('Choose a whole number within the remaining coffee slots.')); return; }
  const amount = BigInt(units) * snapshot.contributionPrice;
  review(`Save ${coffeeCount(units)}?`, `${rupiah(money(amount))} demo rupiah will move into the campaign. You may see two wallet confirmations: allow this amount, then save your coffees. Coffees unlock after successful funding.`, async () => {
    const s = await activeSession();
    if (snapshot.phase !== 0n || snapshot.now >= snapshot.deadline || BigInt(units) > snapshot.capUnits - snapshot.totalUnits) throw Error('Funding changed while you were reviewing. Check the remaining coffees before trying again.');
    if (!snapshot.approved || snapshot.paused) throw Error('This wallet cannot contribute right now. Check café approval and pause status.');
    if (snapshot.cash < amount) throw Error('You need more demo rupiah. Use “Get practice money” first.');
    await ensureAllowance(s, amount, updateTransaction);
    await sendTransaction(s, 'Save my coffees', () => s.campaign.contribute(units), updateTransaction);
    return `${coffeeCount(units)} saved. Collect them once funding succeeds.`;
  });
});
$('#claim-rewards').addEventListener('click', () => review('Collect your coffees?', 'Move all available original coffees and rewards into your coffee pass. No demo rupiah is charged.', async () => {
  const s = await activeSession(); const amount = cups(snapshot.claimable);
  await sendTransaction(s, 'Collect coffees', () => s.campaign.claim(), updateTransaction);
  return `${coffeeCount(amount)} collected into your pass.`;
}));
$('#redeem').addEventListener('click', () => review('One latte, please?', `Use 1 coffee ticket. The campaign pays ${rupiah(money(snapshot.coffeePrice))} demo rupiah to the café from its reserve. You are NOT charged demo rupiah again. No real drink is ordered.`, async () => {
  const s = await activeSession();
  await sendTransaction(s, 'Use one coffee', () => s.campaign.redeem(1, receiptReference()), updateTransaction);
  return 'One coffee ticket used. The campaign paid the café from its reserve.';
}));
$('#finalize').addEventListener('click', () => review('Finish funding?', 'If the goal was reached, the café receives its growth funding and supporters can collect coffees. Otherwise, refunds open.', async () => {
  const s = await activeSession(); await sendTransaction(s, 'Finish funding', () => s.campaign.finalize(), updateTransaction); return 'Funding finished. Your pass will show the next available action.';
}));
$('#refund').addEventListener('click', () => review('Return your demo money?', 'Your full contribution will return from the failed campaign to your wallet.', async () => {
  const s = await activeSession(); await sendTransaction(s, 'Return demo money', () => s.campaign.refund(), updateTransaction); return 'Your contribution was returned to your wallet.';
}));
$('#approval-form').addEventListener('submit', event => {
  event.preventDefault(); let wallet;
  try { wallet = getAddress($('#supporter-address').value.trim()); if (/^0x0{40}$/i.test(wallet)) throw Error(); }
  catch { resetPopup(); showError(Error('Enter a valid, non-empty wallet address starting with 0x.')); return; }
  review('Approve this supporter?', `${wallet} will be able to contribute, collect and use coffee tickets. This sends no money.`, async () => {
    const s = await activeSession(); await sendTransaction(s, 'Approve supporter', () => s.campaign.setApproved(wallet, true), updateTransaction); return 'Supporter approved. They can refresh their coffee pass.';
  });
});
$('#revenue-form').addEventListener('submit', event => {
  event.preventDefault(); if (!snapshot) return;
  const value = $('#sales-amount').value;
  if (!/^\d+$/.test(value) || Number(value) <= 0 || Number(value) > 1e12) { resetPopup(); showError(Error('Enter whole demo rupiah between 1 and 1,000,000,000,000.')); return; }
  const sales = parseUnits(value, 6), amount = sales * snapshot.revenueBps / 10000n;
  review('Share extra coffees?', `${rupiah(money(amount))} demo rupiah moves from YOUR owner wallet into the campaign to fund rewards from ${rupiah(Number(value))} in sample sales. You may see two wallet confirmations.`, async () => {
    const s = await activeSession();
    if (!snapshot.isOwner || snapshot.phase !== 1n || snapshot.paused || snapshot.now >= snapshot.rewardEnd) throw Error('Sales sharing is unavailable. Check the owner account and reporting window.');
    if (snapshot.cash < amount) throw Error('The café owner needs more demo rupiah. Use “Get practice money” first.');
    await ensureAllowance(s, amount, updateTransaction);
    const period = (await s.campaign.lastRevenuePeriod()) + 1n;
    await sendTransaction(s, 'Share coffee rewards', () => s.campaign.reportRevenue(period, sales, receiptReference()), updateTransaction);
    return 'The café funded extra coffees. Supporters can now collect their share.';
  });
});
$('.small-link').addEventListener('click', () => { $('#price-details').open = true; });
$('#cash-help').addEventListener('click', () => { $('#cash-details').open = true; });
render();
