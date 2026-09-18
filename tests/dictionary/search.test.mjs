import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {searchEntries, normalizeTerm, imageUrlForEntry} from '../../dictionary.mjs';

const rows = JSON.parse(readFileSync(new URL('../../dictionary-data.json', import.meta.url), 'utf8'));

test('export is complete, bilingual and preserves leading zeros', () => {
  assert.equal(rows.length, 11824);
  assert.deepEqual(new Set(rows.map(row => row.category)), new Set(['Dream Numbers', 'Zodiac Numbers', 'Festive Numbers']));
  assert.ok(rows.some(row => row.number === '0000' && row.chinese === '七星灯'));
  assert.ok(rows.some(row => row.number === '000'));
  assert.ok(rows.every(row => /^\d{3,4}$/.test(row.number) && typeof row.english === 'string' && typeof row.chinese === 'string'));
  assert.ok(rows.some(row => row.source_language === 'en'));
  assert.ok(rows.some(row => row.source_language === 'zh'));
});

test('exact number searches return corresponding codes only', () => {
  const results = searchEntries(rows, '1222');
  assert.ok(results.length > 0);
  assert.ok(results.every(row => row.number === '1222'));
  assert.ok(searchEntries(rows, '000').every(row => row.number === '000'));
  assert.ok(searchEntries(rows, '12').every(row => row.number.startsWith('12')));
});

test('English and Chinese names can be searched and filtered', () => {
  assert.ok(searchEntries(rows, 'snake').some(row => /snake/i.test(row.english)));
  assert.ok(searchEntries(rows, '蛇').some(row => row.chinese.includes('蛇')));
  assert.ok(searchEntries(rows, 'rat', 'Zodiac Numbers', '4').every(row => row.category === 'Zodiac Numbers' && row.number.length === 4));
  assert.equal(normalizeTerm(' １２２２ '), '1222');
  assert.deepEqual(searchEntries(rows, ''), []);
});

test('source pictures map only to their matching Dream or Zodiac entries', () => {
  const dream = searchEntries(rows, '1222')[0];
  const snake = searchEntries(rows, 'snake', 'Zodiac Numbers')[0];
  const festive = rows.find(row => row.category === 'Festive Numbers');
  assert.equal(imageUrlForEntry(dream), 'https://prddmccms1.blob.core.windows.net/number-dictionary/1222.jpg');
  assert.equal(imageUrlForEntry(snake), 'https://www.damacai.com.my/media/1475/snake.png');
  assert.equal(imageUrlForEntry(festive), null);
  assert.equal(imageUrlForEntry({...dream, number: '../../bad'}), null);
});

test('separate page, data and links are wired locally', () => {
  const html = readFileSync(new URL('../../dictionary.html', import.meta.url), 'utf8');
  const index = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const sitemap = readFileSync(new URL('../../sitemap.xml', import.meta.url), 'utf8');
  assert.match(html, /<h1 id="page-title"><span data-i18n="dictionary">Dictionary/);
  assert.match(html, /dictionary\.mjs/);
  assert.match(index, /href="dictionary\.html"/);
  assert.match(sitemap, /https:\/\/4dresult1\.com\/dictionary\.html/);
});
