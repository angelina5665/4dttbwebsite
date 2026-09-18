import test from 'node:test';
import assert from 'node:assert/strict';
import { currentMalaysiaDate, createDailySelector, DAILY_STORAGE_KEY, getDailyEntry } from '../../glossary-daily.mjs';

const entryIds = ['draw-date', 'canonical', 'source-record'];
const today = new Date('2026-09-10T16:01:00Z');
const tomorrow = new Date('2026-09-11T16:01:00Z');
const stored = (day, entryId) => JSON.stringify({ version: 1, day, entryId });
function memoryStorage(initial = null) {
  let value = initial;
  const writes = [];
  return {
    writes,
    getItem(key) { assert.equal(key, DAILY_STORAGE_KEY); return value; },
    setItem(key, next) { assert.equal(key, DAILY_STORAGE_KEY); writes.push({ key, value: next }); value = next; },
    replace(next) { value = next; },
  };
}
const params = (storage, extra = {}) => ({ entryIds, now: today, storage, random: () => 0.1, ...extra });

test('Malaysia date uses its midnight, not UTC/local machine date', () => {
  assert.equal(currentMalaysiaDate('2026-09-10T15:59:59.999Z'), '2026-09-10');
  assert.equal(currentMalaysiaDate('2026-09-10T16:00:00Z'), '2026-09-11');
  assert.equal(currentMalaysiaDate('2026-12-31T16:00:00Z'), '2027-01-01');
  assert.equal(currentMalaysiaDate('2024-02-28T16:00:00Z'), '2024-02-29');
  assert.equal(currentMalaysiaDate(Date.parse('2026-09-10T16:00:00Z')), '2026-09-11');
});

test('invalid injected clocks fall back safely', () => {
  for (const now of [new Date(NaN), 'not-a-date', null, {}, Symbol('invalid'), new Date(8640000000000000), '9999-12-31T20:00:00Z']) {
    assert.match(currentMalaysiaDate(now), /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
  }
});

test('new day persists only the exact minimal record', () => {
  const storage = memoryStorage();
  const result = createDailySelector()(params(storage));
  assert.deepEqual(result, { day: '2026-09-11', entryId: 'draw-date', storageAvailable: true, persisted: true, source: 'selected' });
  assert.equal(storage.writes.length, 1);
  assert.deepEqual(JSON.parse(storage.writes[0].value), { version: 1, day: '2026-09-11', entryId: 'draw-date' });
});

test('stored choice survives reload and a separate tab without randomness or write', () => {
  const storage = memoryStorage(stored('2026-09-11', 'canonical'));
  for (const select of [createDailySelector(), createDailySelector()]) {
    const result = select(params(storage, { random: () => { throw new Error('must not be used'); } }));
    assert.equal(result.entryId, 'canonical');
    assert.equal(result.source, 'stored');
  }
  assert.equal(storage.writes.length, 0);
});

test('Malaysia midnight changes selection and excludes yesterday when possible', () => {
  const storage = memoryStorage();
  const select = createDailySelector();
  assert.equal(select(params(storage)).entryId, 'draw-date');
  assert.equal(select(params(storage, { now: tomorrow, random: () => 0 })).entryId, 'canonical');
  assert.equal(select(params(storage, { now: tomorrow })).entryId, 'canonical');
});

test('a skipped visit day does not pretend an older stored choice was yesterday', () => {
  const result = createDailySelector()(params(memoryStorage(stored('2026-09-09', 'draw-date')), { random: () => 0 }));
  assert.equal(result.entryId, 'draw-date');
});

test('single topic works without randomness and can repeat next day', () => {
  const select = createDailySelector();
  const storage = memoryStorage();
  const only = params(storage, { entryIds: ['one-topic'], random: () => { throw new Error('unused'); } });
  assert.equal(select(only).entryId, 'one-topic');
  assert.equal(select({ ...only, now: tomorrow }).entryId, 'one-topic');
});

test('corrupt, future, wrong-schema, oversized and removed records recover safely', () => {
  const bad = ['{broken', 'null', '[]', '1', stored('2026-09-12', 'canonical'), stored('2026-02-30', 'canonical'), stored('2026-9-11', 'canonical'), stored('2026-09-11', 'removed-topic'), JSON.stringify({ version: 2, day: '2026-09-11', entryId: 'canonical' }), JSON.stringify({ version: 1, day: '2026-09-11', entryId: 'canonical', visitorId: 'must-not-be-retained' }), 'x'.repeat(2048)];
  for (const raw of bad) {
    const storage = memoryStorage(raw);
    const result = createDailySelector()(params(storage));
    assert.equal(result.entryId, 'draw-date');
    assert.equal(result.persisted, true);
    assert.deepEqual(Object.keys(JSON.parse(storage.writes[0].value)).sort(), ['day', 'entryId', 'version']);
  }
});

test('unavailable storage still gives same-page daily stability', () => {
  const select = createDailySelector();
  const first = select(params(null));
  const again = select(params(null, { random: () => 0.9 }));
  assert.equal(first.storageAvailable, false);
  assert.equal(first.persisted, false);
  assert.equal(again.entryId, first.entryId);
  assert.equal(again.source, 'memory');
  assert.notEqual(select(params(null, { now: tomorrow, random: () => 0 })).entryId, first.entryId);
});

test('storage getter, read and quota errors do not throw', () => {
  const candidates = [null, {}, { getItem() { throw new Error('denied'); }, setItem() {} }, { getItem() { return null; }, setItem() { throw new Error('quota'); } }];
  for (const storage of candidates) {
    const select = createDailySelector();
    assert.equal(select(params(storage)).storageAvailable, false);
    assert.equal(select(params(storage, { random: () => 0.9 })).entryId, 'draw-date');
  }
  const options = params(null);
  Object.defineProperty(options, 'storage', { get() { throw new Error('getter denied'); } });
  assert.equal(createDailySelector()(options).storageAvailable, false);
});

test('silently ignored writes are reported unpersisted', () => {
  const result = createDailySelector()(params({ getItem() { return null; }, setItem() {} }));
  assert.equal(result.storageAvailable, false);
  assert.equal(result.persisted, false);
});

test('memory fallback is persisted when storage becomes available', () => {
  const select = createDailySelector();
  select(params(null));
  const storage = memoryStorage();
  const result = select(params(storage, { random: () => 0.9 }));
  assert.equal(result.entryId, 'draw-date');
  assert.equal(result.source, 'memory');
  assert.equal(result.persisted, true);
});

test('authoritative storage update converges existing page memory', () => {
  const storage = memoryStorage();
  const select = createDailySelector();
  select(params(storage));
  storage.replace(stored('2026-09-11', 'source-record'));
  const result = select(params(storage));
  assert.equal(result.entryId, 'source-record');
  assert.equal(result.source, 'stored');
});

test('a concurrent winner visible on write read-back is adopted', () => {
  const storage = memoryStorage();
  const setItem = storage.setItem;
  storage.setItem = (key, value) => { setItem(key, value); storage.replace(stored('2026-09-11', 'source-record')); };
  const result = createDailySelector()(params(storage));
  assert.equal(result.entryId, 'source-record');
  assert.equal(result.source, 'stored');
});

test('removed topic invalidates memory and selection stays inside current IDs', () => {
  const select = createDailySelector();
  select(params(null));
  const result = select(params(null, { entryIds: ['canonical', 'source-record'], random: () => 0.9 }));
  assert.equal(result.entryId, 'source-record');
});

test('invalid or duplicate IDs reject', () => {
  for (const ids of [undefined, [], Array(1), ['a', , 'c'], 'topic', [1], [''], [' '], [' topic'], ['a', 'a'], ['x'.repeat(129)]]) {
    assert.throws(() => createDailySelector()(params(null, { entryIds: ids })), TypeError);
  }
});

test('bad injected random source rejects when a choice is required', () => {
  for (const random of [null, 1, () => -0.1, () => 1, () => NaN, () => Infinity, () => '0.5', () => { throw new Error('bad'); }]) {
    assert.throws(() => createDailySelector()(params(null, { random })));
  }
});

test('injected randomness reaches first and last topic without mutating IDs', () => {
  const frozen = Object.freeze([...entryIds]);
  assert.equal(createDailySelector()(params(null, { entryIds: frozen, random: () => 0 })).entryId, frozen[0]);
  assert.equal(createDailySelector()(params(null, { entryIds: frozen, random: () => 0.999999 })).entryId, frozen.at(-1));
});

test('crypto rejection is bounded and fallback chooses only a supplied topic', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const originalRandom = Math.random;
  let calls = 0;
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues(buffer) { calls += 1; buffer[0] = 0xffffffff; return buffer; } } });
    Math.random = () => 0.5;
    const result = createDailySelector()({ entryIds, now: today, storage: null });
    assert.equal(calls, 8);
    assert.equal(result.entryId, 'canonical');
  } finally {
    Math.random = originalRandom;
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor); else delete globalThis.crypto;
  }
});

test('named singleton export exists and separate browser factories may coincide', () => {
  assert.equal(typeof getDailyEntry, 'function');
  assert.equal(createDailySelector()(params(memoryStorage())).entryId, createDailySelector()(params(memoryStorage())).entryId);
});
