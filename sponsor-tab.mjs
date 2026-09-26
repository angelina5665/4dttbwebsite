// Bounded, disclosed sponsored-tab opportunities on user-initiated actions.
// Normal button behavior and Back navigation are never cancelled or replaced.
const DESTINATION = 'https://ttbet.fun/RFAA9570A03';
const BUTTON_SESSION_KEY = '4dvip-button-sponsor-attempt-v2';
const BACK_SESSION_KEY = '4dvip-back-sponsor-attempt-v2';
const BUTTON_CHANCE = 0.50;
const BACK_CHANCE = 0.80;
let buttonAttemptedInMemory = false;
let backAttemptedInMemory = false;

export function shouldOpenButtonSponsoredTab(randomValue) {
  return Number.isFinite(randomValue) && randomValue >= 0 && randomValue < BUTTON_CHANCE;
}

export function shouldOpenBackSponsoredTab(randomValue) {
  return Number.isFinite(randomValue) && randomValue >= 0 && randomValue < BACK_CHANCE;
}

function hasAttempted(key, inMemory) {
  if (inMemory) return true;
  try { return sessionStorage.getItem(key) === '1'; } catch { return false; }
}

function markAttempted(key) {
  try { sessionStorage.setItem(key, '1'); } catch {}
}

function openSponsoredTab() {
  window.open(DESTINATION, '_blank', 'noopener,noreferrer');
}

function onButtonClick(event) {
  if (event.defaultPrevented || !event.isTrusted || event.button !== 0 ||
      event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
      !(event.target instanceof Element) || !event.target.closest('button') ||
      hasAttempted(BUTTON_SESSION_KEY, buttonAttemptedInMemory)) return;
  buttonAttemptedInMemory = true;
  markAttempted(BUTTON_SESSION_KEY);
  if (shouldOpenButtonSponsoredTab(Math.random())) openSponsoredTab();
}

function onBackNavigation() {
  if (!hasAttempted(BACK_SESSION_KEY, backAttemptedInMemory)) {
    backAttemptedInMemory = true;
    markAttempted(BACK_SESSION_KEY);
    if (shouldOpenBackSponsoredTab(Math.random())) openSponsoredTab();
  }
  // Continue to the visitor's previous page after observing the guarded Back action.
  queueMicrotask(() => history.back());
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', onButtonClick, true);
  try {
    history.pushState({ ...history.state, sponsorBackGuard: true }, '', location.href);
    window.addEventListener('popstate', onBackNavigation, {once: true});
  } catch {}
}
