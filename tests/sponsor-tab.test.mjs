import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {shouldOpenBackSponsoredTab, shouldOpenButtonSponsoredTab} from '../sponsor-tab.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('button sponsored-tab chance is 50 percent and invalid values fail closed', () => {
  for (const value of [0, 0.01, 0.499999]) assert.equal(shouldOpenButtonSponsoredTab(value), true);
  for (const value of [0.5, 0.8, 0.999999, -0.01, 1, NaN, Infinity]) assert.equal(shouldOpenButtonSponsoredTab(value), false);
});

test('Back sponsored-tab chance is 80 percent and invalid values fail closed', () => {
  for (const value of [0, 0.5, 0.799999]) assert.equal(shouldOpenBackSponsoredTab(value), true);
  for (const value of [0.8, 0.999999, -0.01, 1, NaN, Infinity]) assert.equal(shouldOpenBackSponsoredTab(value), false);
});

test('interactive pages load the disclosed bounded trigger without replacing navigation', () => {
  const home = readFileSync(path.join(root, 'index.html'), 'utf8');
  const script = readFileSync(path.join(root, 'sponsor-tab.mjs'), 'utf8');
  for (const page of ['index.html', 'dictionary.html', '4d-history.html', 'chinese-number-symbolism.html']) {
    assert.match(readFileSync(path.join(root, page), 'utf8'), /src="sponsor-tab\.mjs"/);
  }
  assert.match(home, /id="sponsor-tab-notice" data-i18n="sponsorTabNotice"/);
  assert.match(script, /document\.addEventListener\('click', onButtonClick, true\)/);
  assert.match(script, /window\.addEventListener\('popstate', onBackNavigation/);
  assert.match(script, /window\.open\(DESTINATION, '_blank', 'noopener,noreferrer'\)/);
  assert.match(script, /sessionStorage\.setItem/);
  assert.match(script, /queueMicrotask\(\(\) => history\.back\(\)\)/);
  assert.doesNotMatch(script, /preventDefault\(|location\.(?:assign|replace)\(/);
});
