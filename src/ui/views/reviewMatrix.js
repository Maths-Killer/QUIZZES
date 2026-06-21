/**
 * views/reviewMatrix.js — Review Matrix.
 * Two active sections: Failed Questions Review and Flagged Questions
 * Review. Each can be launched directly into a quiz of just those
 * questions, or browsed individually.
 */

import { getFailedQuestions, getFlaggedQuestions } from '../../data/questionRepository.js';
import { stripImageTokens } from '../../utils/textParser.js';
import { pageHeaderHTML, emptyStateHTML, badgeHTML } from '../components.js';

export async function renderReviewMatrix(container, params, router) {
  container.innerHTML = `
    <div class="pb-24 md:pb-8 md:pl-64">
      ${pageHeaderHTML({ title: 'Review Matrix' })}
      <div class="px-4 md:px-8 py-4 flex flex-col gap-6">

        <section>
          <div class="flex items-center justify-between mb-2">
            <h2 class="text-sm font-semibold text-slate-700 flex items-center gap-2">
              Failed Questions ${badgeHTML('', 'danger')}
            </h2>
          </div>
          <div id="failed-list" class="flex flex-col gap-2"></div>
        </section>

        <section>
          <div class="flex items-center justify-between mb-2">
            <h2 class="text-sm font-semibold text-slate-700 flex items-center gap-2">
              Flagged Questions ${badgeHTML('', 'warning')}
            </h2>
          </div>
          <div id="flagged-list" class="flex flex-col gap-2"></div>
        </section>

      </div>
    </div>`;

  const [failedMap, flaggedMap] = await Promise.all([getFailedQuestions(), getFlaggedQuestions()]);

  renderSection(container.querySelector('#failed-list'), failedMap, router, 'No failed questions yet — keep it up.');
  renderSection(container.querySelector('#flagged-list'), flaggedMap, router, 'No flagged questions yet. Flag tricky ones during a quiz to revisit them here.');
}

function renderSection(listEl, questionMap, router, emptyMessage) {
  const questions = Array.from(questionMap.values());

  if (questions.length === 0) {
    listEl.innerHTML = emptyStateHTML(emptyMessage);
    return;
  }

  listEl.innerHTML = `
    <button id="${listEl.id}-start-btn" class="bg-indigo-600 text-white text-sm font-semibold py-2.5 rounded-xl mb-1 active:bg-indigo-700">
      Start Review Quiz (${questions.length})
    </button>
    ${questions
      .map(
        (q) => `
      <button data-review-question-id="${q.id}" class="text-left bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 hover:bg-slate-50">
        ${escapeText(truncate(stripImageTokens(q.questionText), 100))}
      </button>`
      )
      .join('')}`;

  listEl.querySelector(`#${listEl.id}-start-btn`).addEventListener('click', () => {
    router.navigateTo('quizSettings', {
      filter: { presetIds: questions.map((q) => q.id) },
      sourceLabel: listEl.id === 'failed-list' ? 'Failed Questions Review' : 'Flagged Questions Review',
    });
  });

  listEl.querySelectorAll('[data-review-question-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      router.navigateTo('quiz', { isRelatedChild: true, relatedQuestionId: btn.getAttribute('data-review-question-id') });
    });
  });
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max).trim() + '…' : str;
}

function escapeText(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
