/**
 * quizEngine.js — Stateful controller for a single active quiz run.
 *
 * Ownership boundaries:
 * - quizEngine OWNS the in-memory shape of "what is the current quiz doing
 *   right now" (queue, index, answers, timer). It does NOT own IndexedDB
 *   reads/writes directly except via the small persistence helpers below —
 *   those exist so app.js can call quizEngine.persistSession() from a
 *   visibilitychange handler without reaching into engine internals.
 * - quizEngine does NOT render anything. router/views call into it and
 *   read its serializable state to paint the DOM.
 *
 * The "related question" flow works by router/app.js pushing the result of
 * quizEngine.serialize() onto its own Active View History Stack, then
 * calling quizEngine.loadRelatedQuestion(id) which swaps in a throwaway
 * single-question micro-session. Popping the stack calls
 * quizEngine.restore(savedState) to get pinpoint-precise resumption,
 * including the stopwatch.
 */

import db from '../db/db.js';
import { recordAttempt } from '../db/progress.js';

const SESSION_KEY = 'current';

export const QuizMode = {
  IMMEDIATE: 'immediate', // answers revealed on click
  EXAM: 'exam', // grading only visible after full submission
};

export const TimerMode = {
  TOTAL_COUNTDOWN: 'total_countdown', // HH:MM:SS for the whole quiz
  PER_QUESTION: 'per_question', // fixed seconds per question
  UNTIMED: 'untimed',
};

/**
 * Fisher-Yates shuffle. Pure function, no mutation of input.
 */
function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Internal mutable engine state. Never exported directly — always go
 * through the functions below so call sites can't accidentally mutate
 * the queue array out from under an in-flight render.
 */
let _state = null;

/**
 * @typedef {Object} QuizConfig
 * @property {string} mode - QuizMode.IMMEDIATE | QuizMode.EXAM
 * @property {string} timerMode - TimerMode.*
 * @property {number} [totalSeconds] - required if timerMode is TOTAL_COUNTDOWN
 * @property {number} [perQuestionSeconds] - required if timerMode is PER_QUESTION
 * @property {string[]} questionIds - resolved, already-filtered question id list
 * @property {string} sourceLabel - human label for where this quiz came from
 *   (e.g. "Cardiovascular > Heart Failure" or "Custom Mix: 3 topics")
 */

/**
 * Builds a fresh quiz state object from a resolved list of question ids.
 * Filtering (by topic/subtopic/random mix) happens BEFORE this is called —
 * quizEngine itself is filter-agnostic, it just runs whatever queue it's given.
 *
 * @param {QuizConfig} config
 * @returns {object} the new engine state (also stored internally)
 */
export function startNewQuiz(config) {
  const queue = shuffle(config.questionIds);

  _state = {
    sourceLabel: config.sourceLabel,
    mode: config.mode,
    timerMode: config.timerMode,
    totalSeconds: config.totalSeconds ?? null,
    perQuestionSeconds: config.perQuestionSeconds ?? null,
    queue, // array of question ids, fixed order for this run
    currentIndex: 0,
    answers: {}, // { [questionId]: { selectedIndex, isCorrect, revealedAt } }
    remainingSeconds: config.timerMode === TimerMode.TOTAL_COUNTDOWN
      ? config.totalSeconds
      : config.timerMode === TimerMode.PER_QUESTION
        ? config.perQuestionSeconds
        : null,
    startedAt: Date.now(),
    submittedAt: null,
    // Stack of saved parent states, used for the related-question flow.
    // Each entry is a full serialize() snapshot taken at the moment the
    // user navigated away to a related question.
    relatedStack: [],
  };

  return serialize();
}

/** Returns a deep-enough copy of current state safe to hand to renderers. */
export function serialize() {
  if (!_state) return null;
  return JSON.parse(JSON.stringify(_state));
}

/** Restores engine state from a previously serialized snapshot, verbatim. */
export function restore(savedState) {
  _state = JSON.parse(JSON.stringify(savedState));
  return serialize();
}

export function getCurrentQuestionId() {
  if (!_state) return null;
  return _state.queue[_state.currentIndex] ?? null;
}

export function getProgressMeta() {
  if (!_state) return null;
  return {
    currentIndex: _state.currentIndex,
    total: _state.queue.length,
    answeredCount: Object.keys(_state.answers).length,
  };
}

/**
 * Records the user's selection for the current question.
 * In IMMEDIATE mode, callers should reveal correctness right after this
 * resolves. In EXAM mode, correctness is computed but UI should NOT show
 * it until submitQuiz() is called.
 *
 * @param {string} questionId
 * @param {number} selectedIndex
 * @param {number} correctIndex
 */
export function answerQuestion(questionId, selectedIndex, correctIndex) {
  if (!_state) throw new Error('No active quiz.');
  _state.answers[questionId] = {
    selectedIndex,
    isCorrect: selectedIndex === correctIndex,
    revealedAt: Date.now(),
  };
  return serialize();
}

export function goToIndex(index) {
  if (!_state) throw new Error('No active quiz.');
  if (index < 0 || index >= _state.queue.length) return serialize();
  _state.currentIndex = index;
  if (_state.timerMode === TimerMode.PER_QUESTION) {
    _state.remainingSeconds = _state.perQuestionSeconds;
  }
  return serialize();
}

export function nextQuestion() {
  if (!_state) throw new Error('No active quiz.');
  return goToIndex(_state.currentIndex + 1);
}

export function previousQuestion() {
  if (!_state) throw new Error('No active quiz.');
  return goToIndex(_state.currentIndex - 1);
}

/** Decrements the active timer by one tick (called from a setInterval in app.js). */
export function tickTimer() {
  if (!_state || _state.remainingSeconds === null) return serialize();
  _state.remainingSeconds = Math.max(0, _state.remainingSeconds - 1);
  return serialize();
}

export function isQuizComplete() {
  if (!_state) return false;
  return Object.keys(_state.answers).length >= _state.queue.length;
}

/**
 * Finalizes the quiz: writes progress rows for every answered question,
 * computes the result summary, persists it to the RESULTS store, and
 * clears the active session row so refresh doesn't try to resume a
 * finished quiz.
 *
 * @param {Map<string, object>} questionLookup - map of questionId -> full
 *   question object (topicId, subtopicId, correctIndex, etc.) so the
 *   engine doesn't need to import the data layer's domain shape directly.
 * @returns {Promise<object>} the persisted result record
 */
export async function submitQuiz(questionLookup) {
  if (!_state) throw new Error('No active quiz.');
  _state.submittedAt = Date.now();

  const perSubtopic = {}; // subtopicId -> { correct, total, title }
  let correctCount = 0;

  for (const qId of _state.queue) {
    const q = questionLookup.get(qId);
    const answer = _state.answers[qId];
    const wasCorrect = !!answer?.isCorrect;
    if (wasCorrect) correctCount += 1;

    if (q) {
      await recordAttempt(qId, q.topicId, q.subtopicId, wasCorrect);

      if (!perSubtopic[q.subtopicId]) {
        perSubtopic[q.subtopicId] = { correct: 0, total: 0, subtopicId: q.subtopicId };
      }
      perSubtopic[q.subtopicId].total += 1;
      if (wasCorrect) perSubtopic[q.subtopicId].correct += 1;
    }
  }

  const timeSpentSeconds = Math.round((_state.submittedAt - _state.startedAt) / 1000);
  const totalAllotted = _state.timerMode === TimerMode.TOTAL_COUNTDOWN ? _state.totalSeconds : null;

  const result = {
    id: `result_${_state.submittedAt}`,
    sourceLabel: _state.sourceLabel,
    mode: _state.mode,
    completedAt: _state.submittedAt,
    scorePercent: _state.queue.length > 0 ? Math.round((correctCount / _state.queue.length) * 100) : 0,
    correctCount,
    totalCount: _state.queue.length,
    timeSpentSeconds,
    totalAllottedSeconds: totalAllotted,
    perSubtopicBreakdown: Object.values(perSubtopic),
    reviewReel: _state.queue.map((qId) => ({
      questionId: qId,
      isCorrect: !!_state.answers[qId]?.isCorrect,
      selectedIndex: _state.answers[qId]?.selectedIndex ?? null,
    })),
  };

  await db.put(db.STORES.RESULTS, result);
  await clearPersistedSession();

  return result;
}

// ---------------------------------------------------------------------------
// Related-question history stack (in-memory push/pop, mirrors app.js's
// Active View History Stack but scoped to quiz-internal state so the
// "Return to Parent Quiz" button restores with pinpoint precision even
// if the user drilled into 3 related questions in a row).
// ---------------------------------------------------------------------------

/**
 * Pushes the current full quiz state onto the related-question stack, then
 * leaves _state pointed at the SAME object (caller is responsible for then
 * calling loadRelatedQuestion or similar to actually change context — this
 * function only captures the snapshot).
 */
export function pushRelatedSnapshot() {
  if (!_state) throw new Error('No active quiz.');
  const snapshot = serialize();
  _state.relatedStack.push(snapshot);
  return snapshot;
}

/**
 * Pops the most recent snapshot off the related-question stack and
 * restores it as the live engine state. Returns null if the stack was
 * empty (caller should treat this as "nothing to return to").
 */
export function popRelatedSnapshot() {
  if (!_state || _state.relatedStack.length === 0) return null;
  const parentSnapshot = _state.relatedStack[_state.relatedStack.length - 1];
  // Pop from the snapshot's own recorded stack length, not the live one,
  // since restoring replaces _state entirely.
  const newState = JSON.parse(JSON.stringify(parentSnapshot));
  _state = newState;
  return serialize();
}

export function hasParentQuiz() {
  return !!_state && _state.relatedStack.length > 0;
}

// ---------------------------------------------------------------------------
// Session persistence (resume-on-reload)
// ---------------------------------------------------------------------------

/**
 * Serializes current state into the SESSIONS store. Called from app.js's
 * visibilitychange/beforeunload listeners, and also opportunistically
 * after every answer so a hard crash loses at most one answer.
 */
export async function persistSession() {
  if (!_state) return;
  await db.put(db.STORES.SESSIONS, { key: SESSION_KEY, state: _state, savedAt: Date.now() });
}

/**
 * Checks for and returns an unfinished session, WITHOUT mutating live
 * engine state. app.js decides whether to show the "Resume Session?"
 * overlay and only calls restore() if the user confirms.
 */
export async function findResumableSession() {
  const row = await db.get(db.STORES.SESSIONS, SESSION_KEY);
  if (!row || !row.state) return null;
  if (row.state.submittedAt) return null; // already finished, stale row
  return row.state;
}

export async function clearPersistedSession() {
  await db.delete(db.STORES.SESSIONS, SESSION_KEY);
}

export function hasActiveQuiz() {
  return !!_state && !_state.submittedAt;
}

export function discardActiveQuiz() {
  _state = null;
}
