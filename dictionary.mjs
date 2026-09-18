import {t} from './site-language.mjs';
const DATA_URL = 'dictionary-data.json';
const PAGE_SIZE = 48;
const DREAM_IMAGE_BASE = 'https://prddmccms1.blob.core.windows.net/number-dictionary/';
const ZODIAC_IMAGES = Object.freeze({
  rat: '/media/1469/rat.png', ox: '/media/1471/ox.png',
  tiger: '/media/1472/tiger.png', rabbit: '/media/1473/rabbit.png',
  dragon: '/media/1474/dragon.png', snake: '/media/1475/snake.png',
  horse: '/media/1476/horse.png', goat: '/media/1477/goat.png',
  monkey: '/media/1478/monkey.png', rooster: '/media/1479/rooster.png',
  dog: '/media/1027/dog.png', boar: '/media/1085/pig.png'
});

// These paths are the images used by Da Ma Cai's public dictionary page.
// Festive entries have no matching source illustration, so do not substitute
// another category's numbered image and imply it depicts that festival.
export function imageUrlForEntry(entry) {
  if (!entry || !/^\d{3,4}$/.test(entry.number)) return null;
  if (entry.category === 'Dream Numbers') return `${DREAM_IMAGE_BASE}${entry.number}.jpg`;
  if (entry.category === 'Zodiac Numbers') {
    const path = ZODIAC_IMAGES[normalizeTerm(entry.english)];
    return path ? `https://www.damacai.com.my${path}` : null;
  }
  return null;
}

export function normalizeTerm(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('en').trim();
}

export function searchEntries(entries, rawQuery, category = 'all', length = 'all') {
  const query = normalizeTerm(rawQuery);
  if (!query) return [];
  const numeric = /^\d{1,4}$/.test(query);
  const exactNumber = numeric && query.length >= 3;
  return entries.map((entry, index) => {
    if (category !== 'all' && entry.category !== category) return null;
    if (length !== 'all' && entry.number.length !== Number(length)) return null;
    let score = 0;
    if (numeric) {
      if (exactNumber) score = entry.number === query ? 100 : 0;
      else score = entry.number.startsWith(query) ? 50 : 0;
    } else {
      const english = normalizeTerm(entry.english);
      const chinese = normalizeTerm(entry.chinese);
      const subEnglish = normalizeTerm(entry.subcategory_en);
      const subChinese = normalizeTerm(entry.subcategory_zh);
      if (english === query || chinese === query) score = 100;
      else if (english.startsWith(query) || chinese.startsWith(query)) score = 80;
      else if (english.includes(query) || chinese.includes(query)) score = 60;
      else if (subEnglish.includes(query) || subChinese.includes(query)) score = 30;
    }
    return score ? {entry, index, score} : null;
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.index - b.index).map(item => item.entry);
}

function sourceLabel(language) {
  return ({'bilingual feed': t('bilingualFeed'), both: t('bothPages'), en: t('englishOnly'), zh: t('chineseOnly')})[language] || t('sourceEntry');
}

function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['www.damacai.com.my', 'damacai.com.my'].includes(url.hostname) ? url.href : null;
  } catch { return null; }
}

function el(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

function card(entry) {
  const article = el('article', 'dictionary-result');
  const head = el('div', 'dictionary-result-head');
  const categoryKey = {'Dream Numbers':'dream','Zodiac Numbers':'zodiac','Festive Numbers':'festive'}[entry.category];
  head.append(el('strong', '', entry.number), el('span', '', (categoryKey ? t(categoryKey) : entry.category) + (entry.number.length === 3 ? ' · 3D' : ' · 4D')));
  const imageBox = el('div', 'dictionary-image');
  const imageUrl = imageUrlForEntry(entry);
  if (imageUrl) {
    const image = el('img');
    image.src = imageUrl;
    image.alt = `Da Ma Cai illustration for ${entry.english}`;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.width = 290;
    image.height = 288;
    const unavailable = el('span', 'dictionary-no-image', t('sourceMissing'));
    unavailable.hidden = true;
    image.addEventListener('error', () => { image.hidden = true; unavailable.hidden = false; }, {once: true});
    imageBox.append(image, unavailable);
  } else {
    imageBox.append(el('span', 'dictionary-no-image', t('noPicture')));
  }
  const body = el('div', 'dictionary-result-body');
  body.append(el('h3', 'dictionary-english', entry.english));
  const chinese = el('p', 'dictionary-chinese', entry.chinese);
  chinese.lang = 'zh-Hans';
  body.append(chinese);
  if (entry.category !== 'Dream Numbers') {
    const sub = el('p', 'dictionary-subcategory', entry.subcategory_en + ' · ' + entry.subcategory_zh);
    body.append(sub);
  }
  const source = el('div', 'dictionary-source');
  const url = safeSourceUrl(entry.source_url);
  if (url) {
    const link = el('a', '', t('source'));
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    source.append(link);
  }
  source.append(el('span', '', sourceLabel(entry.source_language)));
  body.append(source);
  article.append(head, imageBox, body);
  return article;
}

function validEntry(entry) {
  return entry && typeof entry === 'object' && /^\d{3,4}$/.test(entry.number)
    && typeof entry.english === 'string' && typeof entry.chinese === 'string'
    && typeof entry.category === 'string' && typeof entry.subcategory_en === 'string'
    && typeof entry.subcategory_zh === 'string' && typeof entry.source_url === 'string';
}

function start() {
  const form = document.getElementById('dictionary-search');
  if (!form) return;
  const query = document.getElementById('dictionary-query');
  const category = document.getElementById('dictionary-category');
  const length = document.getElementById('dictionary-length');
  const status = document.getElementById('dictionary-status');
  const results = document.getElementById('dictionary-results');
  const more = document.getElementById('dictionary-more');
  const historyLink = document.getElementById('history-lookup-link');
  let entries = [];
  let matches = [];
  let shown = 0;
  let debounce;

  function showNext() {
    const fragment = document.createDocumentFragment();
    const end = Math.min(shown + PAGE_SIZE, matches.length);
    for (let i = shown; i < end; i += 1) fragment.append(card(matches[i]));
    results.append(fragment);
    shown = end;
    more.hidden = shown >= matches.length;
    if (matches.length) status.textContent = t('dictionaryShowing', shown, matches.length);
  }

  function search() {
    clearTimeout(debounce);
    results.replaceChildren();
    more.hidden = true;
    shown = 0;
    if (historyLink) historyLink.href = /^\d{4}$/.test(normalizeTerm(query.value)) ? `4d-history.html?number=${encodeURIComponent(normalizeTerm(query.value))}` : '4d-history.html';
    if (!entries.length) return;
    matches = searchEntries(entries, query.value, category.value, length.value);
    if (!normalizeTerm(query.value)) {
      status.textContent = t('dictionaryReady', entries.length);
      return;
    }
    if (!matches.length) {
      status.textContent = t('dictionaryNoMatch');
      results.append(el('p', 'dictionary-empty', t('dictionaryEmpty')));
      return;
    }
    showNext();
  }

  form.addEventListener('submit', event => { event.preventDefault(); search(); });
  form.addEventListener('reset', event => { event.preventDefault(); query.value = ''; category.value = 'all'; length.value = 'all'; search(); query.focus(); });
  query.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(search, 140); });
  category.addEventListener('change', search);
  length.addEventListener('change', search);
  more.addEventListener('click', showNext);
  document.addEventListener('site-language-change', search);

  fetch(DATA_URL, {credentials: 'same-origin'}).then(response => {
    if (!response.ok) throw new Error('Data file unavailable');
    return response.json();
  }).then(payload => {
    if (!Array.isArray(payload) || !payload.length || !payload.every(validEntry)) throw new Error('Invalid data file');
    entries = payload;
    search();
  }).catch(() => {
    status.textContent = t('dictionaryLoadError');
  });
}

if (typeof document !== 'undefined') start();
