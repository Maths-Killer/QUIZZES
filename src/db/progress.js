/**
 * progress.js — Progress tracking queries.
 *
 * Per the spec: subtopic progress = Completed Unique Question IDs / Total
 * Count in that subtopic's array. "Completed" here means status is
 * 'correct' OR 'incorrect' (i.e. attempted at least once) — unseen
 * questions don't count toward completion, but flagged status is tracked
 * separately and doesn't affect completion math.
 *
 * Every function here is index-driven (countByIndex / queryIndex), so
 * computing progress for a 5,000-question bank never deserializes the
 * full question or progress store into memory.
 */

import db from './db.js';

/**
 * @param {string} subtopicId
 * @returns {Promise<{ completed: number, total: number, ratio: number }>}
 */
export async function getSubtopicProgress(subtopicId) {
  const total = await db.countByIndex(db.STORES.PROGRESS, 'by_subtopicId', subtopicId);

  const rows = await db.queryIndex(db.STORES.PROGRESS, 'by_subtopicId', subtopicId);
  const completed = rows.filter((r) => r.status === 'correct' || r.status === 'incorrect').length;

  return {
    completed,
    total,
    ratio: total > 0 ? completed / total : 0,
  };
}

/**
 * Topic-level progress aggregates across all subtopics under that topic.
 * Uses the by_topicId index directly (not a loop over subtopics) so it's
 * a single indexed scan regardless of how many subtopics the topic has.
 */
export async function getTopicProgress(topicId) {
  const total = await db.countByIndex(db.STORES.PROGRESS, 'by_topicId', topicId);
  const rows = await db.queryIndex(db.STORES.PROGRESS, 'by_topicId', topicId);
  const completed = rows.filter((r) => r.status === 'correct' || r.status === 'incorrect').length;

  return {
    completed,
    total,
    ratio: total > 0 ? completed / total : 0,
  };
}

/**
 * Global app-level progress: % of total questions completed across the
 * entire bank. Single full-store count + filter — acceptable because this
 * is the ONE place we intentionally need the global aggregate, and it's
 * called rarely (dashboard mount), not per-row in a render loop.
 */
export async function getGlobalProgress() {
  const allProgress = await db.getAll(db.STORES.PROGRESS);
  const total = allProgress.length;
  const completed = allProgress.filter((r) => r.status === 'correct' || r.status === 'incorrect').length;

  return {
    completed,
    total,
    ratio: total > 0 ? completed / total : 0,
  };
}

/**
 * Batch variant: computes progress for many subtopics in one pass over
 * the PROGRESS store instead of N separate indexed queries. Use this when
 * rendering a full topic list with many subtopics at once (dashboard),
 * to avoid N+1 IndexedDB round-trips.
 *
 * @param {string[]} subtopicIds
 * @returns {Promise<Record<string, {completed:number,total:number,ratio:number}>>}
 */
export async function getBatchSubtopicProgress(subtopicIds) {
  const allProgress = await db.getAll(db.STORES.PROGRESS);
  const idSet = new Set(subtopicIds);
  const buckets = Object.fromEntries(subtopicIds.map((id) => [id, { completed: 0, total: 0, ratio: 0 }]));

  for (const row of allProgress) {
    if (!idSet.has(row.subtopicId)) continue;
    const bucket = buckets[row.subtopicId];
    bucket.total += 1;
    if (row.status === 'correct' || row.status === 'incorrect') {
      bucket.completed += 1;
    }
  }

  for (const id of subtopicIds) {
    const b = buckets[id];
    b.ratio = b.total > 0 ? b.completed / b.total : 0;
  }

  return buckets;
}

/**
 * Records the outcome of an attempted question. Called once per question
 * as the user answers it (immediate mode) or once per question on submit
 * (exam mode, looped by quizEngine).
 */
export async function recordAttempt(questionId, topicId, subtopicId, wasCorrect) {
  await db.put(db.STORES.PROGRESS, {
    id: questionId,
    topicId,
    subtopicId,
    status: wasCorrect ? 'correct' : 'incorrect',
    flagged: await getQuestionFlagState(questionId),
    lastAttemptAt: Date.now(),
  });
}

/** Public: returns whether a given question is currently flagged. */
export async function getQuestionFlagState(questionId) {
  const existing = await db.get(db.STORES.PROGRESS, questionId);
  return existing ? !!existing.flagged : false;
}

export async function toggleFlag(questionId) {
  const existing = await db.get(db.STORES.PROGRESS, questionId);
  if (!existing) return false;
  const updated = { ...existing, flagged: !existing.flagged };
  await db.put(db.STORES.PROGRESS, updated);
  return updated.flagged;
}

export async function getFlaggedQuestionIds() {
  const rows = await db.queryIndex(db.STORES.PROGRESS, 'by_flagged', true);
  return rows.map((r) => r.id);
}

export async function getFailedQuestionIds() {
  const rows = await db.queryIndex(db.STORES.PROGRESS, 'by_status', 'incorrect');
  return rows.map((r) => r.id);
}
