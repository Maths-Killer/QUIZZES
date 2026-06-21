/**
 * views/quizSettings.js — Pre-Quiz Configuration screen.
 * Rendered as a full view (per the no-modal rule), even though the spec
 * calls it a "window" — it's a full-page step between Summary/QuizBuilder
 * and the actual Quiz view.
 */

import { buildQuizQueue } from '../../data/questionRepository.js';
import * as quizEngine from '../../engine/quizEngine.js';
import { pageHeaderHTML, wireBackButton } from '../components.js';

export async function renderQuizSettings(container, params, router) {
  const { filter, sourceLabel } = params;

  container.innerHTML = `
    <div class="pb-28 md:pb-8 md:pl-64">
      ${pageHeaderHTML({ title: 'Quiz Settings', subtitle: sourceLabel, showBack: true })}
      <div class="px-4 md:px-8 py-4 flex flex-col gap-6 max-w-xl">

        <section>
          <h2 class="text-sm font-semibold text-slate-700 mb-2">Answer Mode</h2>
          <div class="grid grid-cols-2 gap-2" id="mode-toggle">
            <button data-mode="${quizEngine.QuizMode.IMMEDIATE}" class="mode-btn border-2 border-indigo-500 bg-indigo-50 text-indigo-700 rounded-xl p-3 text-left">
              <p class="font-semibold text-sm">Immediate</p>
              <p class="text-xs text-slate-500 mt-0.5">Answers revealed on click</p>
            </button>
            <button data-mode="${quizEngine.QuizMode.EXAM}" class="mode-btn border-2 border-slate-200 rounded-xl p-3 text-left">
              <p class="font-semibold text-sm">Exam Simulation</p>
              <p class="text-xs text-slate-500 mt-0.5">Grading shown after submit</p>
            </button>
          </div>
        </section>

        <section>
          <h2 class="text-sm font-semibold text-slate-700 mb-2">Timer</h2>
          <div class="grid grid-cols-3 gap-2 mb-3" id="timer-toggle">
            <button data-timer="${quizEngine.TimerMode.UNTIMED}" class="timer-btn border-2 border-indigo-500 bg-indigo-50 text-indigo-700 rounded-xl p-2.5 text-xs font-semibold">Untimed</button>
            <button data-timer="${quizEngine.TimerMode.TOTAL_COUNTDOWN}" class="timer-btn border-2 border-slate-200 rounded-xl p-2.5 text-xs font-semibold">Total Countdown</button>
            <button data-timer="${quizEngine.TimerMode.PER_QUESTION}" class="timer-btn border-2 border-slate-200 rounded-xl p-2.5 text-xs font-semibold">Per Question</button>
          </div>

          <div id="total-countdown-config" class="hidden flex gap-2 items-center">
            <input type="number" min="0" max="23" value="0" id="hh" class="w-16 border border-slate-200 rounded-lg p-2 text-center text-sm" />:
            <input type="number" min="0" max="59" value="30" id="mm" class="w-16 border border-slate-200 rounded-lg p-2 text-center text-sm" />:
            <input type="number" min="0" max="59" value="0" id="ss" class="w-16 border border-slate-200 rounded-lg p-2 text-center text-sm" />
            <span class="text-xs text-slate-500 ml-1">HH:MM:SS total</span>
          </div>

          <div id="per-question-config" class="hidden flex gap-2 items-center">
            <input type="number" min="5" max="600" value="60" id="per-question-seconds" class="w-20 border border-slate-200 rounded-lg p-2 text-center text-sm" />
            <span class="text-xs text-slate-500">seconds per question</span>
          </div>
        </section>

        <section>
          <h2 class="text-sm font-semibold text-slate-700 mb-2">Question Count</h2>
          <div class="flex gap-2 items-center">
            <input type="number" min="1" id="question-limit" placeholder="All available" class="w-32 border border-slate-200 rounded-lg p-2 text-sm" />
            <span id="available-count" class="text-xs text-slate-500"></span>
          </div>
        </section>

      </div>
    </div>
    <div class="fixed bottom-16 md:bottom-0 left-0 right-0 md:left-64 z-30 bg-white border-t border-slate-200 p-3">
      <button id="start-quiz-btn" class="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl active:bg-indigo-700 transition-colors disabled:opacity-50" disabled>
        Resolving questions…
      </button>
    </div>`;

  wireBackButton(container, router);

  let state = {
    mode: quizEngine.QuizMode.IMMEDIATE,
    timerMode: quizEngine.TimerMode.UNTIMED,
  };

  const modeToggle = container.querySelector('#mode-toggle');
  modeToggle.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mode = btn.getAttribute('data-mode');
      modeToggle.querySelectorAll('.mode-btn').forEach((b) => setActiveStyle(b, b === btn));
    });
  });

  const timerToggle = container.querySelector('#timer-toggle');
  const totalConfig = container.querySelector('#total-countdown-config');
  const perQConfig = container.querySelector('#per-question-config');

  timerToggle.querySelectorAll('.timer-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.timerMode = btn.getAttribute('data-timer');
      timerToggle.querySelectorAll('.timer-btn').forEach((b) => setActiveStyle(b, b === btn));
      totalConfig.classList.toggle('hidden', state.timerMode !== quizEngine.TimerMode.TOTAL_COUNTDOWN);
      perQConfig.classList.toggle('hidden', state.timerMode !== quizEngine.TimerMode.PER_QUESTION);
    });
  });

  const startBtn = container.querySelector('#start-quiz-btn');
  const availableCountEl = container.querySelector('#available-count');

  const { ids, sourceLabel: resolvedLabel } = await buildQuizQueue(filter);
  availableCountEl.textContent = `${ids.length} question${ids.length !== 1 ? 's' : ''} available`;
  startBtn.disabled = ids.length === 0;
  startBtn.textContent = ids.length === 0 ? 'No questions match this filter' : 'Start Quiz';

  startBtn.addEventListener('click', () => {
    const limitInput = container.querySelector('#question-limit').value;
    const limit = limitInput ? parseInt(limitInput, 10) : null;

    let finalIds = ids;
    if (limit && limit > 0 && limit < ids.length) {
      finalIds = sampleWithoutReplacement(ids, limit);
    }

    const config = {
      mode: state.mode,
      timerMode: state.timerMode,
      questionIds: finalIds,
      sourceLabel: sourceLabel || resolvedLabel,
    };

    if (state.timerMode === quizEngine.TimerMode.TOTAL_COUNTDOWN) {
      const hh = parseInt(container.querySelector('#hh').value || '0', 10);
      const mm = parseInt(container.querySelector('#mm').value || '0', 10);
      const ss = parseInt(container.querySelector('#ss').value || '0', 10);
      config.totalSeconds = hh * 3600 + mm * 60 + ss;
    }

    if (state.timerMode === quizEngine.TimerMode.PER_QUESTION) {
      config.perQuestionSeconds = parseInt(container.querySelector('#per-question-seconds').value || '60', 10);
    }

    quizEngine.startNewQuiz(config);
    router.navigateTo('quiz', {});
  });
}

function setActiveStyle(btn, isActive) {
  btn.classList.toggle('border-indigo-500', isActive);
  btn.classList.toggle('bg-indigo-50', isActive);
  btn.classList.toggle('text-indigo-700', isActive);
  btn.classList.toggle('border-slate-200', !isActive);
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
