import {t} from './site-language.mjs';

// Reuses the affiliate creative and destination already present on the homepage.
// Replace these constants when a different approved campaign is supplied.
const CREATIVE = 'ttb-mobile.jpg';
const DESTINATION = 'https://ttbet.fun/RFAA9570A03';
const SESSION_KEY = '4dvip-promo-banner-shown-v1';
const DELAY_MS = 6000;

function alreadyShown() {
  try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
}
function markShown() {
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch {}
}
function showBanner() {
  if (alreadyShown() || document.querySelector('.promo-banner')) return;
  const banner = document.createElement('aside');
  banner.className = 'promo-banner';
  banner.setAttribute('aria-label', t('promotion'));
  const top = document.createElement('div');
  top.className = 'promo-banner-top';
  const label = document.createElement('span');
  label.textContent = t('promotion');
  const close = document.createElement('button');
  close.className = 'promo-banner-close';
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', t('closePromotion'));
  close.addEventListener('click', () => banner.remove());
  top.append(label, close);
  const link = document.createElement('a');
  link.href = DESTINATION;
  link.rel = 'sponsored nofollow';
  link.setAttribute('aria-label', t('openPromotion'));
  const image = document.createElement('img');
  image.src = CREATIVE;
  image.alt = 'TTBet';
  image.width = 1772;
  image.height = 886;
  link.append(image);
  banner.append(top, link);
  document.body.append(banner);
  markShown();
  document.addEventListener('site-language-change', () => {
    banner.setAttribute('aria-label', t('promotion'));
    label.textContent = t('promotion');
    close.setAttribute('aria-label', t('closePromotion'));
    link.setAttribute('aria-label', t('openPromotion'));
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(showBanner, DELAY_MS), {once:true});
  else setTimeout(showBanner, DELAY_MS);
}
