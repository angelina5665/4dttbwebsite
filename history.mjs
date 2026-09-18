import {t, getLanguage} from './site-language.mjs';
const PROVIDERS = new Set(['damacai','magnum','toto']);
const TOP = [['first','1st prize'],['second','2nd prize'],['third','3rd prize']];
const OTHER = [['special','Special'],['consolation','Consolation']];
const SOURCE_ROOT = 'https://github.com/deadboy18/malaysia-4d/blob/';
const SOURCE_FILES = {damacai:'damacai_draws.csv',magnum:'magnum_draws.csv',toto:'sportstoto_draws.csv'};
const PROVIDER_LOGOS = {damacai:'logos/damacai.png',magnum:'logos/magnum.png',toto:'logos/toto.png'};
const PAGE_SIZE = 8;
export const isFourDigits = value => typeof value === 'string' && /^[0-9]{4}$/.test(value);
export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}
export function allNumbers(draw) {
  return [...TOP.map(([key]) => draw.prizes[key]), ...OTHER.flatMap(([key]) => draw.prizes[key])].filter(isFourDigits);
}
export function validateArchive(data) {
  const fail = () => { throw new Error('The archive format or provenance could not be verified.'); };
  if (!data || data.schemaVersion !== 2 || !Array.isArray(data.providers) || !Array.isArray(data.draws) || !data.draws.length || data.draws.length > 100000) fail();
  const names = new Map();
  for (const provider of data.providers) {
    if (!PROVIDERS.has(provider.id) || names.has(provider.id) || typeof provider.name !== 'string' || !provider.name.trim() || provider.name.length > 80) fail();
    names.set(provider.id,provider.name);
  }
  const keys = new Set();
  for (const draw of data.draws) {
    if (!names.has(draw.providerId) || !isIsoDate(draw.date) || !draw.prizes || !draw.source) fail();
    const key = draw.providerId + ':' + draw.date;
    if (keys.has(key)) fail();
    keys.add(key);
    if (draw.drawNo !== null && (typeof draw.drawNo !== 'string' || draw.drawNo.length > 60)) fail();
    for (const [key] of TOP) if (draw.prizes[key] !== null && !isFourDigits(draw.prizes[key])) fail();
    for (const [key] of OTHER) if (!Array.isArray(draw.prizes[key]) || draw.prizes[key].length > 30 || !draw.prizes[key].every(isFourDigits)) fail();
    if (!allNumbers(draw).length || draw.source.dataset !== 'deadboy18/malaysia-4d' || !/^[a-f0-9]{40}$/.test(draw.source.commit) || draw.source.url !== SOURCE_ROOT + draw.source.commit + '/data/' + SOURCE_FILES[draw.providerId]) fail();
  }
  const dates = data.draws.map(draw => draw.date).sort();
  const usedProviders = new Set(data.draws.map(draw => draw.providerId));
  if (!data.coverage || data.coverage.limited !== true || data.coverage.from !== dates[0] || data.coverage.to !== dates.at(-1) || data.coverage.drawCount !== data.draws.length || data.coverage.providerCount !== usedProviders.size) fail();
  return data;
}
export function filterDraws(data, {number = '', date = '', providerId = '', prizeType = 'first'} = {}) {
  if (number && !isFourDigits(number)) throw new Error('Enter exactly four digits, for example 0038, or leave the number blank.');
  if (date && !isIsoDate(date)) throw new Error('Choose a valid recorded date.');
  if (providerId && !data.providers.some(provider => provider.id === providerId)) throw new Error('Choose a provider in this archive.');
  if (!['first','all','jackpot'].includes(prizeType)) throw new Error('Choose a valid prize type.');
  if (prizeType === 'jackpot') return [];
  return data.draws.filter(draw => (!date || draw.date === date) && (!providerId || draw.providerId === providerId) && (!number || (prizeType === 'first' ? draw.prizes.first === number : allNumbers(draw).includes(number))))
    .sort((a,b) => b.date.localeCompare(a.date) || a.providerId.localeCompare(b.providerId));
}
function formatDate(value) {
  return new Intl.DateTimeFormat(({en:'en-GB',zh:'zh-CN',ms:'ms-MY'})[getLanguage()],{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
}
function make(tag,className,text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function numberNode(value, query) {
  if (value === null) return make('span','not-recorded','Not recorded');
  const node = make(value === query ? 'mark' : 'span','result-number' + (value === query ? ' match' : ''),value);
  if (value === query) node.setAttribute('aria-label',value + ', matches your search');
  return node;
}
function drawCard(draw,names,query) {
  const card = make('article','draw-card');
  const header = make('header','draw-card-header');
  const identity = make('div','provider-identity');
  const logo = make('img','provider-logo');
  logo.src = PROVIDER_LOGOS[draw.providerId];
  logo.alt = '';
  logo.loading = 'lazy';
  logo.width = 84;
  logo.height = 42;
  const title = make('h3','provider-name',names.get(draw.providerId));
  const date = make('time','draw-date',formatDate(draw.date)); date.dateTime = draw.date;
  title.append(date); identity.append(logo,title); header.append(identity,make('span','record-label',t('archived')));
  const body = make('div','draw-prizes');
  const top = make('dl','top-prizes');
  for (const [key,label] of TOP) {
    const group = make('div'); const value = make('dd'); value.append(numberNode(draw.prizes[key],query));
    group.append(make('dt','',t(({first:'firstPrize',second:'secondPrize',third:'thirdPrize'})[key])),value); top.append(group);
  }
  body.append(top);
  const details = make('details','other-prizes'); details.append(make('summary','',t('otherPrizes')));
  if (query && OTHER.some(([key]) => draw.prizes[key].includes(query))) details.open = true;
  for (const [key,label] of OTHER) {
    const group = make('section','prize-group'); group.append(make('h4','',t(key)));
    if (draw.prizes[key].length) { const grid = make('div','number-grid'); for (const number of draw.prizes[key]) grid.append(numberNode(number,query)); group.append(grid); }
    else group.append(make('p','empty-prize','No numbers recorded in this category.'));
    details.append(group);
  }
  body.append(details);
  const source = make('div','source-note');
  const link = make('a','',t('savedSource')); link.href = draw.source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label','Saved source record for ' + names.get(draw.providerId) + ', ' + formatDate(draw.date) + ' (opens in a new tab)');
  source.append(make('span','',draw.drawNo ? 'Draw ' + draw.drawNo : 'Draw number not recorded'),link);
  card.append(header,body,source); return card;
}
function start() {
  const form = document.getElementById('history-search');
  if (!form) return;
  const fields = document.getElementById('search-fields');
  const input = document.getElementById('history-number');
  const date = document.getElementById('history-date');
  const provider = document.getElementById('history-provider');
  const prizeType = document.getElementById('history-prize-type');
  const coverage = document.getElementById('coverage');
  const list = document.getElementById('draw-list');
  const summary = document.getElementById('results-summary');
  const error = document.getElementById('filter-error');
  const empty = document.getElementById('empty-state');
  const loadError = document.getElementById('load-error');
  const more = document.getElementById('load-more');
  const retry = document.getElementById('retry-load');
  let data, names, matches = [], query = '', shown = 0;
  function render(reset = false) {
    if (reset) { list.replaceChildren(); shown = 0; }
    const next = Math.min(shown + PAGE_SIZE,matches.length);
    const fragment = document.createDocumentFragment();
    for (const draw of matches.slice(shown,next)) fragment.append(drawCard(draw,names,query));
    list.append(fragment); shown = next;
    empty.hidden = matches.length !== 0 || prizeType.value === 'jackpot'; more.hidden = shown >= matches.length;
    const filterLabel = query ? ' for ' + query : '';
    summary.textContent = prizeType.value === 'jackpot' ? t('jackpotUnavailable')
      : matches.length ? t('historyShowing',shown,matches.length,query) : t('historyNoMatch',query);
  }
  function applyFilters() {
    if (!data) return;
    try {
      const value = input.value;
      const nextMatches = filterDraws(data,{number:value,date:date.value,providerId:provider.value,prizeType:prizeType.value});
      error.hidden = true; error.textContent = ''; input.removeAttribute('aria-invalid');
      query = value; matches = nextMatches; render(true);
    } catch (failure) {
      error.textContent = failure.message; error.hidden = false; input.setAttribute('aria-invalid','true'); input.focus();
    }
  }
  async function load() {
    fields.disabled = true; retry.disabled = true; loadError.hidden = true; empty.hidden = true; more.hidden = true;
    list.replaceChildren(); summary.textContent = 'Loading archive…'; coverage.textContent = 'Loading recorded dates…';
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(),15000);
    try {
      const response = await fetch('history-data.json',{cache:'no-cache',signal:controller.signal});
      if (!response.ok) throw new Error('Archive request failed');
      data = validateArchive(await response.json());
      names = new Map(data.providers.map(item => [item.id,item.name]));
      provider.replaceChildren(new Option(t('allProviders'),''));
      for (const item of data.providers) provider.add(new Option(item.name,item.id));
      date.min = data.coverage.from;
      date.max = data.coverage.to;
      coverage.textContent = formatDate(data.coverage.from) + ' – ' + formatDate(data.coverage.to) + ' · ' + data.coverage.providerCount + ' providers';
      fields.disabled = false; applyFilters();
    } catch {
      data = undefined; loadError.hidden = false; coverage.textContent = 'Archive unavailable';
      summary.textContent = 'Unable to load verified archive data. No search was performed.';
    } finally { clearTimeout(timer); retry.disabled = false; }
  }
  form.addEventListener('submit',event => { event.preventDefault(); applyFilters(); });
  form.addEventListener('reset',event => { event.preventDefault(); input.value = ''; date.value = ''; provider.value = ''; prizeType.value = 'first'; applyFilters(); });
  more.addEventListener('click',() => render());
  retry.addEventListener('click',load);
  document.addEventListener('site-language-change', () => {
    if (!data) return;
    const currentProvider = provider.value;
    provider.options[0].textContent = t('allProviders');
    provider.value = currentProvider;
    render(true);
  });
  const deepLink = new URLSearchParams(location.search).get('number');
  if (deepLink && isFourDigits(deepLink)) input.value = deepLink;
  load();
}
if (typeof document !== 'undefined') start();
