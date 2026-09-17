// Educational topic IDs only. No number/pick generation, network or visitor ID.
export const DAILY_STORAGE_KEY = '4dvip.glossary.daily.v1';
const VERSION = 1;
const UINT32_RANGE = 0x100000000;
const MAX_CRYPTO_ATTEMPTS = 8;
const malaysiaFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
});

function usableDate(value) {
  try {
    const date = value instanceof Date ? new Date(value.getTime())
      : typeof value === 'string' || typeof value === 'number' ? new Date(value) : null;
    if (date && Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 1 && date.getUTCFullYear() <= 9999) return date;
  } catch { /* Invalid injected clocks fall back to the actual clock. */ }
  return new Date();
}

export function currentMalaysiaDate(now = new Date()) {
  const parts = malaysiaFormatter.formatToParts(usableDate(now));
  const field = type => parts.find(part => part.type === type).value;
  const day = `${field('year').padStart(4, '0')}-${field('month')}-${field('day')}`;
  return validDay(day) ? day : currentMalaysiaDate(new Date());
}

function validDay(day) {
  if (typeof day !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(day)) return false;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
}

function previousDay(day) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function validateIds(entryIds) {
  if (!Array.isArray(entryIds) || entryIds.length === 0 || Array.from(entryIds).some(id =>
    typeof id !== 'string' || id.length === 0 || id.length > 128 || id.trim() !== id)) {
    throw new TypeError('entryIds must contain nonempty, trimmed strings of at most 128 characters');
  }
  if (new Set(entryIds).size !== entryIds.length) throw new TypeError('entryIds must be unique');
  return [...entryIds];
}

function validRecord(record, ids, today) {
  return record !== null && typeof record === 'object' && !Array.isArray(record)
    && Object.keys(record).length === 3
    && Object.hasOwn(record, 'version') && Object.hasOwn(record, 'day') && Object.hasOwn(record, 'entryId')
    && record.version === VERSION && validDay(record.day) && record.day <= today
    && ids.has(record.entryId);
}

function readRecord(storage, ids, today) {
  const raw = storage.getItem(DAILY_STORAGE_KEY);
  if (raw === null) return null;
  if (typeof raw !== 'string' || raw.length > 1024) return null;
  try {
    const value = JSON.parse(raw);
    return validRecord(value, ids, today) ? value : null;
  } catch { return null; }
}

function resolveStorage(options) {
  try {
    const candidate = Object.hasOwn(options, 'storage') ? options.storage : globalThis.localStorage;
    return candidate && typeof candidate.getItem === 'function' && typeof candidate.setItem === 'function'
      ? candidate : null;
  } catch { return null; }
}

function floatIndex(count, random) {
  if (typeof random !== 'function') throw new TypeError('random must be a function');
  let value;
  try { value = random(); } catch (cause) { throw new TypeError('Random source failed', { cause }); }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError('Random source must return a finite number in [0, 1)');
  }
  return Math.floor(value * count);
}

function chooseTopicIndex(count, injectedRandom) {
  if (count === 1) return 0;
  if (injectedRandom !== undefined) return floatIndex(count, injectedRandom);
  // Rejection sampling avoids modulo bias. The bounded fallback is only for
  // unavailable/failing crypto or eight consecutive rejected samples.
  try {
    const cryptoSource = globalThis.crypto;
    if (cryptoSource && typeof cryptoSource.getRandomValues === 'function') {
      const buffer = new Uint32Array(1);
      const limit = Math.floor(UINT32_RANGE / count) * count;
      for (let attempt = 0; attempt < MAX_CRYPTO_ATTEMPTS; attempt += 1) {
        cryptoSource.getRandomValues(buffer);
        if (buffer[0] < limit) return buffer[0] % count;
      }
    }
  } catch { /* No browser crypto permission is requested. */ }
  return floatIndex(count, Math.random);
}

/** One factory per page/test isolates the in-memory fallback. */
export function createDailySelector() {
  let memory = null;
  return function getDailyEntry(options = {}) {
    const ids = validateIds(options.entryIds);
    const allowed = new Set(ids);
    const day = currentMalaysiaDate(options.now);
    const storage = resolveStorage(options);
    let storageAvailable = storage !== null;
    let stored = null;
    if (storageAvailable) {
      try { stored = readRecord(storage, allowed, day); }
      catch { storageAvailable = false; }
    }
    if (stored?.day === day) {
      memory = { ...stored };
      return { day, entryId: stored.entryId, storageAvailable: true, persisted: true, source: 'stored' };
    }

    const validMemory = validRecord(memory, allowed, day) ? memory : null;
    const memoryToday = validMemory?.day === day;
    let selected;
    if (memoryToday) {
      selected = { ...validMemory };
    } else {
      const yesterday = previousDay(day);
      const prior = stored?.day === yesterday ? stored : validMemory?.day === yesterday ? validMemory : null;
      const choices = ids.length > 1 && prior ? ids.filter(id => id !== prior.entryId) : ids;
      selected = { version: VERSION, day, entryId: choices[chooseTopicIndex(choices.length, options.random)] };
    }
    memory = { ...selected };
    let persisted = false;
    let source = memoryToday ? 'memory' : 'selected';
    if (storageAvailable) {
      try {
        storage.setItem(DAILY_STORAGE_KEY, JSON.stringify(selected));
        const readBack = readRecord(storage, allowed, day);
        if (readBack?.day === day) {
          // Last stored choice is authoritative if another tab won a race.
          if (readBack.entryId !== selected.entryId) source = 'stored';
          selected = readBack;
          memory = { ...readBack };
          persisted = true;
        } else {
          storageAvailable = false;
        }
      } catch { storageAvailable = false; }
    }
    return { day, entryId: selected.entryId, storageAvailable, persisted, source };
  };
}

// localStorage is not an atomic compare-and-set. Concurrent first-ever tab calls
// can briefly differ; call again on a storage event to converge on the last
// stored record. Visitors may receive the same topic; uniqueness is not promised.
export const getDailyEntry = createDailySelector();
