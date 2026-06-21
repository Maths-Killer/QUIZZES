/**
 * seed.js — One-time (or version-gated) import of bundled static question
 * banks into IndexedDB.
 *
 * Why this exists separately from db.js:
 * - db.js is a generic, dumb key-value layer. It should never know about
 *   "topics" or "question banks" as a domain concept.
 * - This file owns the domain-specific decision of WHEN to (re)seed.
 *
 * Re-seed strategy:
 * - We store a single meta row { key: 'seedVersion', value: <int> }.
 * - SEED_VERSION below is bumped whenever the bundled JSON content changes
 *   (new questions added, corrections made). On mismatch, we re-import the
 *   QUESTIONS store (overwriting via put — safe because question ids are
 *   stable) but we NEVER touch the PROGRESS store, so user progress survives
 *   content updates.
 */

import db from './db.js';
import { ALL_TOPICS } from '../data/index.js';

const SEED_VERSION = 2; // bumped: topicMeta/subtopicMeta now include summaryText
const SEED_VERSION_KEY = 'seedVersion';

/**
 * Flattens the nested topic -> subtopic -> questions[] structure into a
 * flat array of question rows ready for bulkPut into the QUESTIONS store.
 * Also returns lightweight topic/subtopic metadata (counts, titles,
 * summaryText) used by the dashboard and Summary Primer view without
 * re-deriving it on every render.
 *
 * summaryText is OPTIONAL at both levels in the raw bundled JSON:
 *   topic.summaryText      -> chapter-level overview, shown on the Summary
 *                             Primer page before any subtopic-specific
 *                             content (see summary.js)
 *   subtopic.summaryText   -> the textbook-style primer for that specific
 *                             subtopic
 * Neither field touches questionRows — summaryText is purely metadata,
 * never duplicated onto individual question objects.
 */
function flattenTopics(topics) {
  const questionRows = [];
  const topicMeta = [];

  for (const topic of topics) {
    const subtopicMeta = [];

    for (const subtopic of topic.subtopics) {
      for (const q of subtopic.questions) {
        questionRows.push({
          ...q,
          topicId: topic.id,
          subtopicId: subtopic.id,
        });
      }

      subtopicMeta.push({
        id: subtopic.id,
        topicId: topic.id,
        title: subtopic.title,
        totalQuestions: subtopic.questions.length,
        summaryText: subtopic.summaryText || '',
      });
    }

    topicMeta.push({
      id: topic.id,
      title: topic.title,
      totalQuestions: subtopicMeta.reduce((sum, s) => sum + s.totalQuestions, 0),
      summaryText: topic.summaryText || '',
      subtopics: subtopicMeta,
    });
  }

  return { questionRows, topicMeta };
}

/**
 * Ensures every question has a corresponding PROGRESS row.
 * Uses a single getAll on PROGRESS (acceptable once at boot; this is the
 * only place we read the full progress store) to compute the diff, then
 * bulkPuts only the missing rows. Never overwrites existing progress.
 */
async function ensureProgressRows(questionRows) {
  const existing = await db.getAll(db.STORES.PROGRESS);
  const existingIds = new Set(existing.map((r) => r.id));

  const missing = questionRows
    .filter((q) => !existingIds.has(q.id))
    .map((q) => ({
      id: q.id,
      topicId: q.topicId,
      subtopicId: q.subtopicId,
      status: 'unseen', // 'unseen' | 'correct' | 'incorrect'
      flagged: false,
      lastAttemptAt: null,
    }));

  if (missing.length > 0) {
    await db.bulkPut(db.STORES.PROGRESS, missing);
  }

  return missing.length;
}

/**
 * Runs on app boot. Idempotent and cheap if already seeded at current
 * version (single meta read + no-op).
 * @returns {Promise<{ seeded: boolean, topicMeta: object[] }>}
 */
export async function ensureSeeded() {
  const metaRow = await db.get(db.STORES.META, SEED_VERSION_KEY);
  const currentVersion = metaRow ? metaRow.value : 0;

  const { questionRows, topicMeta } = flattenTopics(ALL_TOPICS);

  if (currentVersion < SEED_VERSION) {
    await db.bulkPut(db.STORES.QUESTIONS, questionRows);
    await db.put(db.STORES.META, { key: SEED_VERSION_KEY, value: SEED_VERSION });
    await ensureProgressRows(questionRows);
    await db.put(db.STORES.META, { key: 'topicMeta', value: topicMeta });
    return { seeded: true, topicMeta };
  }

  // Already at current version — but a fresh install could still be
  // missing progress rows (e.g. dev reset of just the PROGRESS store),
  // so this stays cheap-but-safe rather than skipping entirely.
  await ensureProgressRows(questionRows);

  let cachedMeta = await db.get(db.STORES.META, 'topicMeta');
  if (!cachedMeta) {
    await db.put(db.STORES.META, { key: 'topicMeta', value: topicMeta });
    cachedMeta = { key: 'topicMeta', value: topicMeta };
  }

  return { seeded: false, topicMeta: cachedMeta.value };
}

export async function getTopicMeta() {
  const row = await db.get(db.STORES.META, 'topicMeta');
  return row ? row.value : [];
}
