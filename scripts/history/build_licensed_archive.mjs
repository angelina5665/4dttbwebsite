// Build a dated, static copy of the MIT-licensed malaysia-4d draw CSVs.
// Usage: node scripts/history/build_licensed_archive.mjs <reference-repository>
// The reference repository is not required by the deployed website.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const repo = process.argv[2];
if (!repo) throw new Error('Pass the local malaysia-4d repository path.');
const commit = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid source commit.');
const names = [
  ['toto', 'Sports Toto 4D', 'sportstoto_draws.csv'],
  ['magnum', 'Magnum 4D', 'magnum_draws.csv'],
  ['damacai', 'Da Ma Cai 1+3D', 'damacai_draws.csv'],
];
const four = value => {
  if (value === '') return null;
  // Some source CSV cells were serialized by pandas as integral floats.
  const digits = value.replace(/\.0$/, '');
  if (!/^\d{1,4}$/.test(digits)) throw new Error(`Invalid 4D value: ${value}`);
  return digits.padStart(4, '0');
};
const draws = [];
for (const [providerId, , filename] of names) {
  const data = fs.readFileSync(path.join(repo, 'data', filename), 'utf8');
  const lines = data.trim().split(/\r?\n/);
  const columns = lines.shift().split(',');
  const at = Object.fromEntries(columns.map((key, index) => [key, index]));
  for (const needed of ['draw_seq', 'date', 'prize_1', 'prize_2', 'prize_3']) if (!(needed in at)) throw new Error(`${filename}: missing ${needed}`);
  const seen = new Set();
  for (const line of lines) {
    const fields = line.split(',');
    const date = fields[at.date];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || seen.has(date)) throw new Error(`${filename}: duplicate or invalid date ${date}`);
    seen.add(date);
    const get = key => four(fields[at[key]] || '');
    draws.push({
      providerId, date, drawNo: fields[at.draw_seq] || null,
      prizes: {
        first: get('prize_1'), second: get('prize_2'), third: get('prize_3'),
        special: Array.from({length: 10}, (_, i) => get(`special_${i + 1}`)).filter(Boolean),
        consolation: Array.from({length: 10}, (_, i) => get(`consol_${i + 1}`)).filter(Boolean),
      },
      source: {
        dataset: 'deadboy18/malaysia-4d', commit,
        url: `https://github.com/deadboy18/malaysia-4d/blob/${commit}/data/${filename}`,
      },
    });
  }
}
draws.sort((a, b) => b.date.localeCompare(a.date) || a.providerId.localeCompare(b.providerId));
const dates = draws.map(draw => draw.date).sort();
const payload = {
  schemaVersion: 2,
  providers: names.map(([id, name]) => ({id, name})),
  coverage: {from: dates[0], to: dates.at(-1), drawCount: draws.length, providerCount: names.length, limited: true},
  license: {name: 'MIT', copyright: 'Copyright (c) 2026 deadboy18', url: `https://github.com/deadboy18/malaysia-4d/blob/${commit}/LICENSE`},
  draws,
};
const target = path.resolve('history-data.json');
fs.writeFileSync(target, JSON.stringify(payload));
console.log(JSON.stringify({target, commit, draws: draws.length, bytes: fs.statSync(target).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'), coverage: payload.coverage}, null, 2));
