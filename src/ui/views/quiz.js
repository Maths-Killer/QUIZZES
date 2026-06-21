/**
 * views/quiz.js — Quiz execution view.
 *
 * Handles three render contexts:
 * 1. Normal in-progress quiz question (most common).
 * 2. A "related question" child view (params.isRelatedChild) — renders a
 *    single standalone question with an omnipresent "Return to Parent
 *    Quiz" button, per the Active View History Stack spec.
 * 3. Resumed-from-session state (engine state was already restored by
 *    app.js before this view mounted — this view doesn't need to know).
 */

import * as quizEngine from '../../engine/quizEngine.js';
import { getQuestionById, getQuestionsByIds } from '../../data/questionRepository.js';
import { toggleFlag, getQuestionFlagState } from '../../db/progress.js';
import { renderTextWithImages } from '../../utils/textParser.js';
import { formatDuration, badgeHTML } from '../components.js';

export async function renderQuiz(container, params) {
  if (params.isRelatedChild) {
    return renderRelatedQuestionView(container, params);
  }

  if (!quizEngine.hasActiveQuiz()) {
    container.innerHTML = `<div class="p-8 text-center text-slate-400 text-sm">No active quiz session.</div>`;
    return;
  }

  const state = quizEngine.serialize();
  const questionId = quizEngine.getCurrentQuestionId();
  const question = await getQuestionById(questionId);

  if (!question) {
    container.innerHTML = `<div class="p-8 text-center text-rose-500 text-sm">Question data missing for id "${questionId}".</div>`;
    return;
  }

  const existingAnswer = state.answers[questionId];
  const progressMeta = quizEngine.getProgressMeta();
  const isFlagged = await getQuestionFlagState(questionId);

  container.innerHTML = buildQuizShell(state, question, existingAnswer, progressMeta, isFlagged);
  wireQuizInteractions(container, state, question, existingAnswer);
  wireTimerDisplay(container);
  retypesetMath(container);
}

function buildQuizShell(state, question, existingAnswer, progressMeta, isFlagged = false) {
  const timerHTML =
    state.timerMode === quizEngine.TimerMode.UNTIMED
      ? ''
      : `<span id="quiz-timer" class="text-sm font-bold tabular-nums ${state.remainingSeconds <= 10 ? 'text-rose-500' : 'text-slate-600'}">${formatDuration(state.remainingSeconds)}</span>`;

  const showCorrectness = state.mode === quizEngine.QuizMode.IMMEDIATE && !!existingAnswer;

  return `
    <div class="pb-28 md:pb-8 md:pl-64">
      <header class="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200">
        <div class="px-4 py-3 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs text-slate-500 truncate">${escapeText(state.sourceLabel)}</p>
            <p class="text-sm font-semibold text-slate-800">Question ${progressMeta.currentIndex + 1} of ${progressMeta.total}</p>
          </div>
          ${timerHTML}
        </div>
        ${renderQuestionJumpStrip(state, progressMeta)}
      </header>

      <div class="px-4 md:px-8 py-4 max-w-2xl mx-auto">
        <div class="bg-white rounded-xl border border-slate-200 p-4 mb-4">
          <div class="flex items-start justify-between gap-2 mb-3">
            <div class="text-base text-slate-800 leading-relaxed flex-1">${renderTextWithImages(question.questionText)}</div>
            <button id="flag-btn" data-flagged="${isFlagged}" class="flex-shrink-0 p-1.5 rounded-full hover:bg-amber-50 ${isFlagged ? 'text-amber-500' : 'text-slate-300'}" title="Flag this question">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="none"><path d="M4 2v20l8-5 8 5V2H4z" fill-opacity="0.15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>

          <div id="options-list" class="flex flex-col gap-2">
            ${question.options.map((opt, i) => renderOption(opt, i, question.correctIndex, existingAnswer, showCorrectness)).join('')}
          </div>

          ${
            showCorrectness && question.explanation
              ? `<div class="mt-4 pt-4 border-t border-slate-100 text-sm text-slate-600 leading-relaxed">
                  <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Explanation</p>
                  ${renderTextWithImages(question.explanation)}
                </div>`
              : ''
          }

          ${
            showCorrectness && question.relatedQuestionIds?.length
              ? `<div class="mt-3 flex flex-wrap gap-2">
                  ${question.relatedQuestionIds
                    .map((id) => `<button data-related-id="${id}" class="text-xs font-medium text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full hover:bg-indigo-100">Related: ${escapeText(id)}</button>`)
                    .join('')}
                </div>`
              : ''
          }
        </div>
      </div>
    </div>

    <div class="fixed bottom-16 md:bottom-0 left-0 right-0 md:left-64 z-30 bg-white border-t border-slate-200 p-3 flex gap-2">
      <button id="prev-btn" class="px-4 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium disabled:opacity-40" ${progressMeta.currentIndex === 0 ? 'disabled' : ''}>Prev</button>
      <button id="primary-action-btn" class="flex-1 bg-indigo-600 text-white font-semibold py-3 rounded-xl active:bg-indigo-700 transition-colors disabled:opacity-50">
        ${getPrimaryButtonLabel(state, existingAnswer, progressMeta)}
      </button>
    </div>`;
}

/**
 * Updates just the timer text node on each tick, rather than re-rendering
 * the whole question — avoids losing focus/scroll position once per
 * second during a timed quiz.
 *
 * Listener lifecycle: a new listener would otherwise be attached on every
 * question navigation within the same quiz, accumulating across a long
 * run. We guard against that by removing any previously-attached handler
 * (stashed on `document` itself) before attaching the new one — so at
 * most one tick/expired listener pair is ever live at a time.
 */
/**
 * Re-triggers MathJax rendering on dynamically injected content.
 * Necessary specifically because rerenderCurrentQuestion() (intra-quiz
 * navigation) and renderRelatedQuestionView() update the DOM via direct
 * innerHTML assignment OUTSIDE of app.js's renderView() dispatcher — the
 * router-level typesetPromise call in app.js only fires on full route
 * changes, not on these in-place updates. Without this, any LaTeX in
 * question 2+ of a quiz would silently never render.
 */
function retypesetMath(container) {
  if (window.MathJax?.typesetPromise) {
    window.MathJax.typesetPromise([container]).catch((err) => console.warn('MathJax typeset error:', err));
  }
}

function wireTimerDisplay(container) {
  if (document.__quizTickHandler) {
    document.removeEventListener('quiz-timer-tick', document.__quizTickHandler);
  }
  if (document.__quizExpiredHandler) {
    document.removeEventListener('quiz-timer-expired', document.__quizExpiredHandler);
  }

  const tickHandler = (event) => {
    const timerEl = container.querySelector('#quiz-timer');
    if (!timerEl) return;
    const remaining = event.detail.remainingSeconds;
    timerEl.textContent = formatDuration(remaining);
    timerEl.classList.toggle('text-rose-500', remaining <= 10);
    timerEl.classList.toggle('text-slate-600', remaining > 10);
  };

  const expiredHandler = async () => {
    if (!container.isConnected) return;
    const allIds = quizEngine.serialize().queue;
    const questionMap = await getQuestionsByIds(allIds);
    const result = await quizEngine.submitQuiz(questionMap);
    dispatchNavigate('result', { result });
  };

  document.addEventListener('quiz-timer-tick', tickHandler);
  document.addEventListener('quiz-timer-expired', expiredHandler);
  document.__quizTickHandler = tickHandler;
  document.__quizExpiredHandler = expiredHandler;
}

/**
 * Horizontal scrollable strip of question-number pills, letting the user
 * jump directly to any question instead of only stepping via Prev/Next.
 *
 * Deliberately reads ONLY from state.answers (already in memory) — does
 * NOT query flag status per-pill, since that would mean N extra IndexedDB
 * reads on every render for a long quiz. Flag state stays visible only on
 * the currently-open question's flag icon, not reflected in the strip.
 */
function renderQuestionJumpStrip(state, progressMeta) {
  const pills = state.queue
    .map((qId, i) => {
      const isCurrent = i === progressMeta.currentIndex;
      const isAnswered = !!state.answers[qId];

      let classes;
      if (isCurrent) {
        classes = 'bg-indigo-600 text-white border-indigo-600';
      } else if (isAnswered) {
        classes = 'bg-indigo-50 text-indigo-700 border-indigo-200';
      } else {
        classes = 'bg-white text-slate-400 border-slate-200';
      }

      return `<button data-jump-index="${i}" class="jump-pill flex-shrink-0 w-8 h-8 rounded-full border text-xs font-semibold flex items-center justify-center transition-colors ${classes}">${i + 1}</button>`;
    })
    .join('');

  return `
    <div class="px-4 pb-2 -mt-0.5 overflow-x-auto">
      <div id="jump-strip" class="flex gap-1.5 w-max">${pills}</div>
    </div>`;
}

function renderOption(optionText, index, correctIndex, existingAnswer, showCorrectness) {
  let classes = 'border-slate-200 text-slate-700';
  let icon = '';

  if (showCorrectness) {
    if (index === correctIndex) {
      classes = 'border-emerald-400 bg-emerald-50 text-emerald-800';
      icon = checkIcon();
    } else if (existingAnswer && index === existingAnswer.selectedIndex) {
      classes = 'border-rose-400 bg-rose-50 text-rose-800';
      icon = xIcon();
    }
  } else if (existingAnswer && index === existingAnswer.selectedIndex) {
    classes = 'border-indigo-400 bg-indigo-50 text-indigo-800';
  }

  return `
    <button data-option-index="${index}" class="option-btn flex items-center justify-between gap-2 text-left border-2 ${classes} rounded-xl px-3.5 py-3 text-sm transition-colors" ${showCorrectness ? 'disabled' : ''}>
      <span class="flex-1">${escapeText(optionText)}</span>
      ${icon}
    </button>`;
}

function getPrimaryButtonLabel(state, existingAnswer, progressMeta) {
  const isLast = progressMeta.currentIndex === progressMeta.total - 1;
  if (state.mode === quizEngine.QuizMode.IMMEDIATE) {
    if (!existingAnswer) return 'Select an answer';
    return isLast ? 'Finish & View Results' : 'Next Question';
  }
  // Exam mode: always just advances or submits, regardless of answer state.
  return isLast ? 'Submit Quiz' : 'Next Question';
}

function wireQuizInteractions(container, state, question, existingAnswer) {
  const optionsList = container.querySelector('#options-list');
  const primaryBtn = container.querySelector('#primary-action-btn');
  const prevBtn = container.querySelector('#prev-btn');
  const flagBtn = container.querySelector('#flag-btn');

  container.querySelectorAll('[data-jump-index]').forEach((pill) => {
    pill.addEventListener('click', () => {
      const targetIndex = parseInt(pill.getAttribute('data-jump-index'), 10);
      quizEngine.goToIndex(targetIndex);
      rerenderCurrentQuestion(container);
    });
  });

  // Keep the current question's pill in view without the user having to
  // manually scroll the strip — relevant once a quiz has more questions
  // than fit on one screen width.
  const activePill = container.querySelector('[data-jump-index].bg-indigo-600');
  if (activePill) {
    activePill.scrollIntoView({ behavior: 'instant', inline: 'center', block: 'nearest' });
  }

  if (!existingAnswer || state.mode === quizEngine.QuizMode.EXAM) {
    optionsList.querySelectorAll('.option-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const selectedIndex = parseInt(btn.getAttribute('data-option-index'), 10);
        quizEngine.answerQuestion(question.id, selectedIndex, question.correctIndex);
        quizEngine.persistSession();
        rerenderCurrentQuestion(container);
      });
    });
  }

  primaryBtn.addEventListener('click', async () => {
    if (quizEngine.isQuizComplete() || isLastQuestion()) {
      const allIds = quizEngine.serialize().queue;
      const questionMap = await getQuestionsByIds(allIds);
      const result = await quizEngine.submitQuiz(questionMap);
      dispatchNavigate('result', { result });
    } else {
      quizEngine.nextQuestion();
      rerenderCurrentQuestion(container);
    }
  });

  prevBtn.addEventListener('click', () => {
    quizEngine.previousQuestion();
    rerenderCurrentQuestion(container);
  });

  flagBtn.addEventListener('click', async () => {
    const newFlagState = await toggleFlag(question.id);
    flagBtn.setAttribute('data-flagged', String(newFlagState));
    flagBtn.classList.toggle('text-amber-500', newFlagState);
    flagBtn.classList.toggle('text-slate-300', !newFlagState);
  });

  container.querySelectorAll('[data-related-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      dispatchNavigate('__related__', { relatedId: btn.getAttribute('data-related-id') });
    });
  });

  function isLastQuestion() {
    const meta = quizEngine.getProgressMeta();
    return meta.currentIndex === meta.total - 1 && !!quizEngine.serialize().answers[question.id];
  }
}

/**
 * Re-renders just the question area in place, without going through the
 * router stack (this is intra-quiz navigation, not a "view" change).
 */
async function rerenderCurrentQuestion(container) {
  const state = quizEngine.serialize();
  const questionId = quizEngine.getCurrentQuestionId();
  const question = await getQuestionById(questionId);
  const existingAnswer = state.answers[questionId];
  const progressMeta = quizEngine.getProgressMeta();
  const isFlagged = await getQuestionFlagState(questionId);

  container.innerHTML = buildQuizShell(state, question, existingAnswer, progressMeta, isFlagged);
  wireQuizInteractions(container, state, question, existingAnswer);
  wireTimerDisplay(container);
  retypesetMath(container);
}

/**
 * Quiz view needs router access for two things the dispatcher doesn't
 * directly hand it post-mount: submitting (-> result view) and the
 * related-question jump. We use a lightweight custom event so quiz.js
 * doesn't need a direct import of app.js (avoids circular import).
 */
function dispatchNavigate(target, detail) {
  document.dispatchEvent(new CustomEvent('app-navigate-request', { detail: { target, ...detail } }));
}

// ---------------------------------------------------------------------------
// Related-question child view
// ---------------------------------------------------------------------------

async function renderRelatedQuestionView(container, params) {
  const question = await getQuestionById(params.relatedQuestionId);

  if (!question) {
    container.innerHTML = `<div class="p-8 text-center text-rose-500 text-sm">Related question not found.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="pb-28 md:pb-8 md:pl-64">
      <header class="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 px-4 py-3">
        ${badgeHTML('Related Question', 'warning')}
      </header>
      <div class="px-4 md:px-8 py-4 max-w-2xl mx-auto">
        <div class="bg-white rounded-xl border border-slate-200 p-4">
          <div class="text-base text-slate-800 leading-relaxed mb-3">${renderTextWithImages(question.questionText)}</div>
          <div class="flex flex-col gap-2 mb-3">
            ${question.options
              .map(
                (opt, i) =>
                  `<div class="border-2 ${i === question.correctIndex ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-700'} rounded-xl px-3.5 py-3 text-sm">${escapeText(opt)}</div>`
              )
              .join('')}
          </div>
          ${
            question.explanation
              ? `<div class="pt-3 border-t border-slate-100 text-sm text-slate-600 leading-relaxed">${renderTextWithImages(question.explanation)}</div>`
              : ''
          }
        </div>
      </div>
    </div>
    <div class="fixed bottom-16 md:bottom-0 left-0 right-0 md:left-64 z-30 bg-white border-t border-slate-200 p-3">
      <button id="return-to-parent-btn" class="w-full bg-slate-800 text-white font-semibold py-3 rounded-xl active:bg-slate-900 transition-colors">
        ← Return to Parent Quiz
      </button>
    </div>`;

  container.querySelector('#return-to-parent-btn').addEventListener('click', () => {
    dispatchNavigate('__return_to_parent__');
  });
  retypesetMath(container);
}

function checkIcon() {
  return `<svg class="w-4 h-4 text-emerald-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
}
function xIcon() {
  return `<svg class="w-4 h-4 text-rose-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>`;
}
function escapeText(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
