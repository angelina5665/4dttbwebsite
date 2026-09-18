// A bounded, disclosed sponsored-tab opportunity on the homepage Dictionary link.
// The click's normal navigation is never cancelled or replaced.
const DESTINATION = 'https://ttbet.fun/RFAA9570A03';
const SESSION_KEY = '4dvip-dictionary-sponsor-attempt-v1';
const CHANCE = 0.25;
let attemptedInMemory = false;

export function shouldOpenSponsoredTab(randomValue) {
  return Number.isFinite(randomValue) && randomValue >= 0 && randomValue < CHANCE;
}

function hasAttempted() {
  if (attemptedInMemory) return true;
  try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
}

function markAttempted() {
  attemptedInMemory = true;
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch {}
}

function onDictionaryClick(event) {
  if (event.defaultPrevented || !event.isTrusted || event.button !== 0 ||
      event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || hasAttempted()) return;
  markAttempted();
  if (!shouldOpenSponsoredTab(Math.random())) return;
  // Called synchronously from the visitor's click; popup blockers may still refuse it.
  window.open(DESTINATION, '_blank', 'noopener,noreferrer');
}

if (typeof document !== 'undefined') {
  const link = document.querySelector('[data-sponsored-tab-trigger]');
  if (link) link.addEventListener('click', onDictionaryClick);
}
