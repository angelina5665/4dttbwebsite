import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const languageSource = readFileSync(path.join(root, 'site-language.mjs'), 'utf8');

test('selected pages expose the same three-language switcher', () => {
  for (const page of ['index.html', 'dictionary.html', '4d-history.html']) {
    const html = readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /data-language-switcher/);
    for (const locale of ['en', 'zh', 'ms']) assert.match(html, new RegExp(`<option value="${locale}"`));
    assert.match(html, /site-language\.mjs/);
  }
});

test('every static translation key has a value in each language', () => {
  const keys = new Set();
  for (const page of ['index.html', 'dictionary.html', '4d-history.html']) {
    const html = readFileSync(path.join(root, page), 'utf8');
    for (const match of html.matchAll(/data-i18n(?:-placeholder|-aria)?="([\w]+)"/g)) keys.add(match[1]);
  }
  for (const key of keys) {
    const occurrences = languageSource.match(new RegExp(`\\b${key}:`, 'g')) ?? [];
    assert.equal(occurrences.length, 3, `Missing or duplicated locale value for ${key}`);
  }
});

test('on-page promotion is labeled, dismissible, and session capped', () => {
  const promo = readFileSync(path.join(root, 'promo-banner.mjs'), 'utf8');
  for (const page of ['index.html', 'dictionary.html', '4d-history.html']) {
    const html = readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /promo-banner\.mjs/);
    assert.match(html, /promo-banner\.css/);
  }
  assert.match(promo, /sessionStorage\.getItem/);
  assert.match(promo, /sessionStorage\.setItem/);
  assert.match(promo, /close\.addEventListener\('click'/);
  assert.match(promo, /rel = 'sponsored nofollow'/);
  assert.doesNotMatch(promo, /window\.open|target\s*=\s*['"]_blank/);
});
