import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {shouldOpenSponsoredTab} from '../sponsor-tab.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('sponsored tab chance is 25 percent and invalid values fail closed', () => {
  for (const value of [0, 0.01, 0.249999]) assert.equal(shouldOpenSponsoredTab(value), true);
  for (const value of [0.25, 0.5, 0.999999, -0.01, 1, NaN, Infinity]) assert.equal(shouldOpenSponsoredTab(value), false);
});

test('only disclosed Dictionary link is wired and normal navigation is preserved', () => {
  const home = readFileSync(path.join(root, 'index.html'), 'utf8');
  const script = readFileSync(path.join(root, 'sponsor-tab.mjs'), 'utf8');
  assert.match(home, /href="dictionary\.html" data-sponsored-tab-trigger aria-describedby="sponsor-tab-notice"/);
  assert.match(home, /id="sponsor-tab-notice" data-i18n="sponsorTabNotice"/);
  assert.match(script, /window\.open\(DESTINATION, '_blank', 'noopener,noreferrer'\)/);
  assert.match(script, /sessionStorage\.setItem/);
  assert.doesNotMatch(script, /preventDefault|location\.href|location\.replace/);
});
