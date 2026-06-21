/**
 * views/result.js — Post-Quiz Performance Result Panel.
 */

import { getTopicMeta } from '../../db/seed.js';
import { formatDuration, pageHeaderHTML, wireBackButton } from '../components.js';

export async function renderResult(container, params, router) {
  const { result } = params;

  if (!result) {
    container.innerHTML = `<div class="p-8 text-center text-slate-400 text-sm">No result data available.</div>`;
    return;
  }

  const topicMeta = await getTopicMeta();
  const subtopicTitleMap = buildSubtopicTitleMap(topicMeta);

  container.innerHTML = `
    <div class="pb-8 md:pl-64">
      ${pageHeaderHTML({ title: 'Quiz Results', subtitle: result.sourceLabel })}
      <div class="px-4 md:px-8 py-4 max-w-2xl mx-auto flex flex-col gap-4">

        <section class="bg-white rounded-xl border border-slate-200 p-5 text-center">
          <p class="text-4xl font-bold ${scoreColorClass(result.scorePercent)}">${result.scorePercent}%</p>
          <p class="text-sm text-slate-500 mt-1">${result.correctCount} / ${result.totalCount} correct</p>
          <div class="flex justify-center gap-6 mt-4 text-sm">
            <div>
              <p class="text-xs text-slate-400">Time Spent</p>
              <p class="font-semibold text-slate-700">${formatDuration(result.timeSpentSeconds)}</p>
            </div>
            ${
              result.totalAllottedSeconds
                ? `<div><p class="text-xs text-slate-400">Time Limit</p><p class="font-semibold text-slate-700">${formatDuration(result.totalAllottedSeconds)}</p></div>`
                : ''
            }
            <div>
              <p class="text-xs text-slate-400">Accuracy</p>
              <p class="font-semibold text-slate-700">${result.correctCount}/${result.totalCount}</p>
            </div>
          </div>
        </section>

        <section class="bg-white rounded-xl border border-slate-200 p-4">
          <h2 class="text-sm font-semibold text-slate-700 mb-3">Performance by Subtopic</h2>
          <div class="flex flex-col gap-2.5">
            ${result.perSubtopicBreakdown
              .map((s) => renderSubtopicBreakdownRow(s, subtopicTitleMap))
              .join('')}
          </div>
        </section>

        <section class="bg-white rounded-xl border border-slate-200 p-4">
          <h2 class="text-sm font-semibold text-slate-700 mb-3">Review Reel</h2>
          <div id="review-reel" class="grid grid-cols-5 sm:grid-cols-8 gap-2"></div>
        </section>

        <button id="back-to-home-btn" class="bg-indigo-600 text-white font-semibold py-3 rounded-xl active:bg-indigo-700 transition-colors">
          Back to Study Home
        </button>
      </div>
    </div>`;

  const reelEl = container.querySelector('#review-reel');
  reelEl.innerHTML = result.reviewReel
    .map(
      (item, i) => `
      <button data-question-id="${item.questionId}" class="aspect-square rounded-lg border-2 ${item.isCorrect ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-rose-400 bg-rose-50 text-rose-700'} text-xs font-bold flex items-center justify-center hover:opacity-80">
        ${i + 1}
      </button>`
    )
    .join('');

  reelEl.querySelectorAll('[data-question-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      router.navigateTo('quiz', { isRelatedChild: true, relatedQuestionId: btn.getAttribute('data-question-id') });
    });
  });

  container.querySelector('#back-to-home-btn').addEventListener('click', () => {
    router.navigateTo('home', {});
  });
}

function renderSubtopicBreakdownRow(s, titleMap) {
  const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
  const title = titleMap[s.subtopicId] || s.subtopicId;
  return `
    <div class="flex items-center justify-between gap-3">
      <p class="text-sm text-slate-600 flex-1 truncate">${escapeText(title)}</p>
      <p class="text-sm font-semibold ${scoreColorClass(pct)} flex-shrink-0">${s.correct}/${s.total} (${pct}%)</p>
    </div>`;
}

function scoreColorClass(pct) {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 60) return 'text-amber-600';
  return 'text-rose-600';
}

function buildSubtopicTitleMap(topicMeta) {
  const map = {};
  for (const topic of topicMeta) {
    for (const sub of topic.subtopics) {
      map[sub.id] = sub.title;
    }
  }
  return map;
}

function escapeText(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
