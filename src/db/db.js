/**
 * db.js — Low-level Promise-based IndexedDB controller.
 *
 * Design notes (important for 5,000+ question scale):
 * - No global mutable state. Every call opens a fresh request against a
 *   singleton connection promise (so we don't reopen the DB on every call,
 *   but we also don't leak connection objects into module-level mutable vars
 *   that callers could stomp on).
 * - Object stores are indexed by topicId/subtopicId so that progress
 *   calculations are range-cursor queries, NOT full-table scans.
 * - "questions" store holds the static bundled question bank (seeded once).
 * - "progress" store holds ONE row per question id: { id, topicId, subtopicId,
 *   status: 'unseen'|'correct'|'incorrect', flagged: bool, lastAttemptAt }.
 *   This is the row that gets queried by topic/subtopic index to compute
 *   completion ratios without touching the full questions store.
 * - "sessions" store holds exactly one row (key: 'current') representing the
 *   in-flight quiz state for resume-on-reload.
 * - "meta" store holds singleton app-level metadata (e.g. seed version).
 */

const DB_NAME = 'quizbank_db';
const DB_VERSION = 1;

const STORES = {
  QUESTIONS: 'questions',
  PROGRESS: 'progress',
  SESSIONS: 'sessions',
  RESULTS: 'results',
  META: 'meta',
};

let _dbPromise = null;

/**
 * Opens (or returns the already-open) database connection.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORES.QUESTIONS)) {
        const qStore = db.createObjectStore(STORES.QUESTIONS, { keyPath: 'id' });
        qStore.createIndex('by_topicId', 'topicId', { unique: false });
        qStore.createIndex('by_subtopicId', 'subtopicId', { unique: false });
        qStore.createIndex('by_topicId_subtopicId', ['topicId', 'subtopicId'], { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.PROGRESS)) {
        const pStore = db.createObjectStore(STORES.PROGRESS, { keyPath: 'id' });
        pStore.createIndex('by_topicId', 'topicId', { unique: false });
        pStore.createIndex('by_subtopicId', 'subtopicId', { unique: false });
        pStore.createIndex('by_status', 'status', { unique: false });
        pStore.createIndex('by_flagged', 'flagged', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
        db.createObjectStore(STORES.SESSIONS, { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains(STORES.RESULTS)) {
        const rStore = db.createObjectStore(STORES.RESULTS, { keyPath: 'id' });
        rStore.createIndex('by_completedAt', 'completedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.META)) {
        db.createObjectStore(STORES.META, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another open connection.'));
  });

  return _dbPromise;
}

/**
 * Runs a transaction against one or more stores.
 * @param {string|string[]} storeNames
 * @param {'readonly'|'readwrite'} mode
 * @param {(tx: IDBTransaction) => void} executor - synchronous body that issues requests
 * @returns {Promise<any>} resolves with whatever value was set via tx.__result, if any
 */
function runTransaction(storeNames, mode, executor) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, mode);
      let result;

      tx.oncomplete = () => resolve(result);
      tx.onerror = (event) => reject(event.target.error);
      tx.onabort = (event) => reject(event.target.error || new Error('Transaction aborted'));

      try {
        result = executor(tx);
      } catch (err) {
        reject(err);
      }
    });
  });
}

/** Wraps a single IDBRequest in a promise. */
function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// ---------------------------------------------------------------------------
// Generic CRUD helpers
// ---------------------------------------------------------------------------

async function put(storeName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(value);
    req.onerror = (e) => reject(e.target.error);
    tx.oncomplete = () => resolve(value);
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function bulkPut(storeName, values) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const value of values) {
      store.put(value);
    }
    tx.oncomplete = () => resolve(values.length);
    tx.onerror = (e) => reject(e.target.error);
    tx.onabort = (e) => reject(e.target.error);
  });
}

async function get(storeName, key) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  return reqToPromise(store.get(key));
}

async function getAll(storeName) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  return reqToPromise(store.getAll());
}

async function deleteKey(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function clearStore(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Queries an index with an optional IDBKeyRange and returns matching records.
 * This is the workhorse for "all questions in topic X" type lookups —
 * uses a cursor over the index, never a full-store getAll() + filter.
 *
 * IMPORTANT: keyRangeOrValue must be a valid IndexedDB key type — string,
 * number, Date, or binary (or an array of those for compound indexes).
 * Booleans are NOT a valid IndexedDB key and will throw a DataError from
 * IDBKeyRange.only() if passed here. If you need to query/index a boolean
 * field, don't add an index for it at all (it only ever has 2 buckets, so
 * an index provides negligible benefit) — instead use db.getAll() and
 * filter in memory, the way getFlaggedQuestionIds() in progress.js does.
 */
async function queryIndex(storeName, indexName, keyRangeOrValue) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  const index = tx.objectStore(storeName).index(indexName);
  const range = keyRangeOrValue instanceof IDBKeyRange
    ? keyRangeOrValue
    : (keyRangeOrValue === undefined ? undefined : IDBKeyRange.only(keyRangeOrValue));
  return reqToPromise(index.getAll(range));
}

/**
 * Counts records matching an index value WITHOUT materializing them.
 * Critical for large datasets — counting 5,000 progress rows by topic
 * should not deserialize every row into memory.
 *
 * Same key-type restriction as queryIndex() above applies here — see that
 * function's doc comment.
 */
async function countByIndex(storeName, indexName, keyRangeOrValue) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  const index = tx.objectStore(storeName).index(indexName);
  const range = keyRangeOrValue instanceof IDBKeyRange
    ? keyRangeOrValue
    : (keyRangeOrValue === undefined ? undefined : IDBKeyRange.only(keyRangeOrValue));
  return reqToPromise(index.count(range));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const db = {
  STORES,
  openDB,
  runTransaction,
  put,
  bulkPut,
  get,
  getAll,
  delete: deleteKey,
  clearStore,
  queryIndex,
  countByIndex,
};

export default db;
