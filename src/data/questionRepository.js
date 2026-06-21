/**
 * questionRepository.js — Domain-level query layer over db.js.
 *
 * This is where "give me all question ids for topic X" or "give me a
 * randomized mix across these 3 subtopics" logic lives. quizEngine.js stays
 * filter-agnostic and just consumes whatever id list this module hands it.
 */

import db from '../db/db.js';
import { stripImageTokens } from '../utils/textParser.js';

/**
 * Fetches full question objects for a list of ids, returned as a Map for
 * O(1) lookup (quizEngine.submitQuiz needs this shape).
 * @param {string[]} ids
 * @returns {Promise<Map<string, object>>}
 */
export async function getQuestionsByIds(ids) {
  const db_ = await db.openDB();
  const tx = db_.transaction(db.STORES.QUESTIONS, 'readonly');
  const store = tx.objectStore(db.STORES.QUESTIONS);

  const map = new Map();
  await Promise.all(
    ids.map(
      (id) =>
        new Promise((resolve, reject) => {
          const req = store.get(id);
          req.onsuccess = () => {
            if (req.result) map.set(id, req.result);
            resolve();
          };
          req.onerror = (e) => reject(e.target.error);
        })
    )
  );

  return map;
}

export async function getQuestionById(id) {
  return db.get(db.STORES.QUESTIONS, id);
}

/** Returns just the id list for a subtopic — used to build quiz queues without pulling full question payloads. */
export async function getQuestionIdsForSubtopic(subtopicId) {
  const rows = await db.queryIndex(db.STORES.QUESTIONS, 'by_subtopicId', subtopicId);
  return rows.map((r) => r.id);
}

export async function getQuestionIdsForTopic(topicId) {
  const rows = await db.queryIndex(db.STORES.QUESTIONS, 'by_topicId', topicId);
  return rows.map((r) => r.id);
}

export async function getAllQuestionIds() {
  const all = await db.getAll(db.STORES.QUESTIONS);
  return all.map((r) => r.id);
}

/**
 * Builds the resolved question-id queue for the Custom Quiz Builder.
 *
 * @param {object} filter
 * @param {string[]} [filter.topicIds]
 * @param {string[]} [filter.subtopicIds]
 * @param {boolean} [filter.fullRandomMix] - if true, ignores topic/subtopic filters and pulls from the entire bank
 * @param {number} [filter.limit] - cap the queue size (randomized mixes are commonly capped, e.g. "50 random questions")
 * @returns {Promise<{ ids: string[], sourceLabel: string }>}
 */
export async function buildQuizQueue(filter) {
  let ids = [];
  let sourceLabel = '';

  if (filter.presetIds?.length) {
    ids = filter.presetIds;
    sourceLabel = 'Review Set';
  } else if (filter.fullRandomMix) {
    ids = await getAllQuestionIds();
    sourceLabel = 'Full Randomized Bank Mix';
  } else if (filter.subtopicIds?.length) {
    const lists = await Promise.all(filter.subtopicIds.map(getQuestionIdsForSubtopic));
    ids = lists.flat();
    sourceLabel = `${filter.subtopicIds.length} Subtopic${filter.subtopicIds.length > 1 ? 's' : ''}`;
  } else if (filter.topicIds?.length) {
    const lists = await Promise.all(filter.topicIds.map(getQuestionIdsForTopic));
    ids = lists.flat();
    sourceLabel = `${filter.topicIds.length} Topic${filter.topicIds.length > 1 ? 's' : ''}`;
  }

  // De-dupe in case a subtopic and its parent topic were both selected.
  ids = Array.from(new Set(ids));

  if (filter.limit && filter.limit > 0 && filter.limit < ids.length) {
    // Random sample without replacement, not just a slice — otherwise a
    // capped "50 random questions" would always be the same 50 (insertion
    // order), defeating the point of "randomized."
    ids = sampleWithoutReplacement(ids, filter.limit);
  }

  return { ids, sourceLabel };
}

function sampleWithoutReplacement(array, n) {
  const pool = array.slice();
  const result = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return result;
}

export async function getFailedQuestions() {
  const { getFailedQuestionIds } = await import('../db/progress.js');
  const ids = await getFailedQuestionIds();
  return getQuestionsByIds(ids);
}

export async function getFlaggedQuestions() {
  const { getFlaggedQuestionIds } = await import('../db/progress.js');
  const ids = await getFlaggedQuestionIds();
  return getQuestionsByIds(ids);
}

// ---------------------------------------------------------------------------
// Search Center — live text scan across all question data
// ---------------------------------------------------------------------------

/**
 * In-memory search index, built lazily once per app session (not persisted
 * — it's cheap to rebuild from IndexedDB and we'd rather not duplicate the
 * question text in two stores). For 5,000+ questions this is a few MB of
 * strings held in memory while the Search Center view is in use; acceptable
 * for a local-first app with no backend.
 */
let _searchIndexCache = null;

async function buildSearchIndex() {
  if (_searchIndexCache) return _searchIndexCache;

  const all = await db.getAll(db.STORES.QUESTIONS);
  _searchIndexCache = all.map((q) => ({
    id: q.id,
    topicId: q.topicId,
    subtopicId: q.subtopicId,
    haystack: [
      stripImageTokens(q.questionText),
      ...(q.options || []),
      stripImageTokens(q.explanation || ''),
      q.reference || '',
      q.additionalInfo || '',
    ]
      .join(' ')
      .toLowerCase(),
  }));

  return _searchIndexCache;
}

/** Invalidate the cache after a Data Portal import so new questions are searchable immediately. */
export function invalidateSearchIndex() {
  _searchIndexCache = null;
}

/**
 * @param {string} query
 * @returns {Promise<{id:string, topicId:string, subtopicId:string}[]>}
 */
export async function searchQuestions(query) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const index = await buildSearchIndex();
  const terms = trimmed.split(/\s+/).filter(Boolean);

  return index
    .filter((entry) => terms.every((term) => entry.haystack.includes(term)))
    .map((entry) => ({ id: entry.id, topicId: entry.topicId, subtopicId: entry.subtopicId }));
}

// ---------------------------------------------------------------------------
// Data Portal — single entry + bulk import
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = ['topicId', 'subtopicId', 'id', 'questionText', 'options', 'correctIndex'];

/**
 * Validates a single raw question object against the schema. Returns a
 * list of human-readable error strings (empty array = valid).
 */
export function validateQuestionObject(obj) {
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === '') {
      errors.push(`Missing required field: "${field}"`);
    }
  }
  if (obj.options && !Array.isArray(obj.options)) {
    errors.push('"options" must be an array of strings.');
  }
  if (obj.options && Array.isArray(obj.options) && obj.options.length < 2) {
    errors.push('"options" must contain at least 2 choices.');
  }
  if (
    typeof obj.correctIndex === 'number' &&
    Array.isArray(obj.options) &&
    (obj.correctIndex < 0 || obj.correctIndex >= obj.options.length)
  ) {
    errors.push('"correctIndex" is out of range for the given "options" array.');
  }
  return errors;
}

/**
 * Imports a single question (from the real-time entry form) or an array
 * of questions (from the bulk import textarea) into the QUESTIONS store,
 * and ensures matching PROGRESS rows exist.
 *
 * @param {object|object[]} input
 * @returns {Promise<{ imported: number, errors: {index:number, errors:string[]}[] }>}
 */
export async function importQuestions(input) {
  const list = Array.isArray(input) ? input : [input];
  const valid = [];
  const errorReport = [];

  list.forEach((obj, index) => {
    const errors = validateQuestionObject(obj);
    if (errors.length > 0) {
      errorReport.push({ index, errors });
    } else {
      valid.push(obj);
    }
  });

  if (valid.length > 0) {
    await db.bulkPut(db.STORES.QUESTIONS, valid);

    const existingProgress = await db.getAll(db.STORES.PROGRESS);
    const existingIds = new Set(existingProgress.map((r) => r.id));
    const newProgressRows = valid
      .filter((q) => !existingIds.has(q.id))
      .map((q) => ({
        id: q.id,
        topicId: q.topicId,
        subtopicId: q.subtopicId,
        status: 'unseen',
        flagged: false,
        lastAttemptAt: null,
      }));

    if (newProgressRows.length > 0) {
      await db.bulkPut(db.STORES.PROGRESS, newProgressRows);
    }

    invalidateSearchIndex();
  }

  return { imported: valid.length, errors: errorReport };
}

/** The example structure block shown in the Data Portal UI, as a formatted string. */
export const EXAMPLE_SCHEMA_BLOCK = `{
  "topicId": "t1",
  "subtopicId": "t1_s1",
  "id": "q_104",
  "questionText": "What is the primary vascular response following tissue injury? [IMG]/assets/injury_cascade.jpg[/IMG]",
  "options": ["Transient vasoconstriction followed by vasodilation", "Persistent vasoconstriction only", "Immediate cellular apoptosis", "Localized amyloid aggregation"],
  "correctIndex": 0,
  "explanation": "Chemical mediators like Histamine trigger immediate vasodilation of local arterioles. See pathway diagram: [IMG]/assets/vaso_path.jpg[/IMG]",
  "reference": "Inflammation slide 1a; Robbin's Pathology 10th Ed Chapter 3",
  "additionalInfo": "Leukotriene B4 also coordinates systemic chemotaxis concurrently.",
  "imagePath": "/assets/img1.jpg",
  "relatedQuestionIds": ["q_105", "q_201"]
}`;
