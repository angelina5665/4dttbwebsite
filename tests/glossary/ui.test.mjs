import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {normalizeSearch,matchingEntries,millisecondsToMalaysiaMidnight} from '../../glossary.mjs';
const read=name=>readFileSync(new URL('../../'+name,import.meta.url),'utf8');
test('glossary search supports English, Chinese, spacing and fullwidth text',()=>{
  const entries=[{id:'bats',text:'Five bats 五蝠 Five blessings'},{id:'arts',text:'Four arts 四艺 Painting'}];
  assert.deepEqual(matchingEntries(entries,' BATs ').map(e=>e.id),['bats']);
  assert.deepEqual(matchingEntries(entries,'五蝠').map(e=>e.id),['bats']);
  assert.deepEqual(matchingEntries(entries,'ＢＡＴＳ').map(e=>e.id),['bats']);
  assert.equal(matchingEntries(entries,'  ').length,2);
  assert.equal(matchingEntries(entries,'not-present').length,0);
  assert.equal(matchingEntries(entries,'0123').length,0);
  assert.equal(normalizeSearch(' Ａ '),'a');
});
test('daily refresh timer targets Malaysia midnight',()=>{
  assert.equal(millisecondsToMalaysiaMidnight(new Date('2026-09-10T15:59:59Z')),1100);
  assert.equal(millisecondsToMalaysiaMidnight(new Date('2026-09-10T16:00:00Z')),86400100);
  assert.equal(millisecondsToMalaysiaMidnight(new Date('2026-12-31T15:59:59.500Z')),1000);
});
test('page is a separate static, crawlable educational glossary',()=>{
  const html=read('chinese-number-symbolism.html');
  assert.equal((html.match(/<h1\b/g)||[]).length,1);
  assert.equal((html.match(/rel="canonical"/g)||[]).length,1);
  assert.ok(html.includes('href="https://4dresult1.com/chinese-number-symbolism.html"'));
  const entries=[...html.matchAll(/<article\b[^>]*id="([a-z-]+)"[^>]*data-glossary-entry/g)];
  assert.ok(entries.length>=6&&entries.length<=8);
  assert.equal(new Set(entries.map(e=>e[1])).size,entries.length);
  assert.equal((html.match(/class="entry-glyph"/g)||[]).length,entries.length);
  assert.equal((html.match(/class="entry-copy-zh"/g)||[]).length,entries.length);
  assert.ok(html.includes('lang="zh-Hans"'));
  assert.ok(html.includes('<noscript>'));
  assert.ok(html.includes('id="glossary-search"')&&html.includes('for="glossary-query"'));
  assert.ok(html.includes('aria-live="polite"'));
  assert.ok(html.includes('Different visitors may see the same entry.'));
  const scripts=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);assert.doesNotThrow(()=>JSON.parse(scripts[0][1]));
});
test('daily UI selects existing educational content without submission or forced redirects',()=>{
  const js=read('glossary.mjs'),html=read('chinese-number-symbolism.html');
  for(const token of ['fetch(','XMLHttpRequest','sendBeacon','innerHTML','location.replace','location.href=','document.cookie']) assert.ok(!js.includes(token),token);
  assert.ok(js.includes("window.addEventListener('storage'"));
  assert.ok(js.includes("window.addEventListener('pageshow'"));
  assert.ok(js.includes("document.addEventListener('visibilitychange'"));
  assert.ok(!/http-equiv=["']refresh/i.test(html));
  assert.ok(!html.includes('ttbet.fun/'));
  assert.ok(!html.includes('4d-history.html'));
  assert.ok(!read('index.html').includes('location.replace'));
});
test('privacy and sitemap accurately include the isolated glossary feature',()=>{
  const privacy=read('privacy.html'),map=read('sitemap.xml');
  assert.equal((privacy.match(/<h2>Daily glossary selection<\/h2>/g)||[]).length,1);
  assert.equal((privacy.match(/<h2>External and affiliate links<\/h2>/g)||[]).length,1);
  assert.ok(privacy.includes('does not create a visitor identifier'));
  assert.deepEqual([...map.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]),['https://4dresult1.com/','https://4dresult1.com/slot-malaysia.html','https://4dresult1.com/chinese-number-symbolism.html','https://4dresult1.com/dictionary.html','https://4dresult1.com/4d-history.html']);
});
test('glossary local links, anchors and assets resolve',()=>{
  const html=read('chinese-number-symbolism.html');
  for(const match of html.matchAll(/(?:href|src)="([^\"]+)"/g)){
    const target=match[1];
    if(target.startsWith('https://'))continue;
    if(target.startsWith('#'))assert.ok(html.includes('id="'+target.slice(1)+'"'),target);
    else assert.ok(existsSync(new URL('../../'+target.split('?')[0],import.meta.url)),target);
  }
  assert.ok(html.includes('若储存被阻止或清除'));
});
