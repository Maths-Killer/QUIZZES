/**
 * views/home.js — Study Home (default view).
 * Hierarchical list of Topics -> Subtopics, with animated progress bars
 * computed via a single batch query (see getBatchSubtopicProgress) to
 * avoid N+1 IndexedDB round-trips when rendering many subtopics at once.
 */

import { getTopicMeta } from '../../db/seed.js';
import { getGlobalProgress, getTopicProgress, getBatchSubtopicProgress } from '../../db/progress.js';
import { progressBarHTML, emptyStateHTML } from '../components.js';

export async function renderHome(container, params, router) {
  container.innerHTML = `
    <div class="pb-24 md:pb-8 md:pl-64">
      <header class="px-4 pt-6 pb-4 md:px-8">
        <h1 class="text-2xl font-bold text-slate-800">Study Home</h1>
        <div id="global-progress-slot" class="mt-3"></div>
      </header>
      <div id="topic-list-slot" class="px-4 md:px-8 flex flex-col gap-4"></div>
    </div>`;

  const globalSlot = container.querySelector('#global-progress-slot');
  const listSlot = container.querySelector('#topic-list-slot');

  const [topicMeta, globalProgress] = await Promise.all([getTopicMeta(), getGlobalProgress()]);

  globalSlot.innerHTML = `
    <div class="bg-white rounded-xl border border-slate-200 p-4">
      <div class="flex justify-between items-baseline mb-2">
        <span class="text-sm font-medium text-slate-600">Overall Progress</span>
        <span class="text-sm font-bold text-indigo-600">${Math.round(globalProgress.ratio * 100)}%</span>
      </div>
      ${progressBarHTML(globalProgress.ratio, { colorClass: 'bg-indigo-500', showLabel: true, completed: globalProgress.completed, total: globalProgress.total })}
    </div>`;

  if (!topicMeta || topicMeta.length === 0) {
    listSlot.innerHTML = emptyStateHTML('No topics loaded yet. Use the Data Portal to import questions.');
    return;
  }

  const allSubtopicIds = topicMeta.flatMap((t) => t.subtopics.map((s) => s.id));
  const [topicProgressList, subtopicProgressMap] = await Promise.all([
    Promise.all(topicMeta.map((t) => getTopicProgress(t.id))),
    getBatchSubtopicProgress(allSubtopicIds),
  ]);

  listSlot.innerHTML = topicMeta
    .map((topic, i) => renderTopicCard(topic, topicProgressList[i], subtopicProgressMap))
    .join('');

  listSlot.querySelectorAll('[data-toggle-topic]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const body = btn.closest('[data-topic-card]').querySelector('[data-topic-body]');
      const chevron = btn.querySelector('[data-chevron]');
      body.classList.toggle('hidden');
      chevron.classList.toggle('rotate-180');
    });
  });

  listSlot.querySelectorAll('[data-subtopic-id]').forEach((row) => {
    row.addEventListener('click', () => {
      router.navigateTo('summary', { subtopicId: row.getAttribute('data-subtopic-id') });
    });
  });
}

function renderTopicCard(topic, topicProgress, subtopicProgressMap) {
  const subtopicsHTML = topic.subtopics
    .map((sub) => {
      const p = subtopicProgressMap[sub.id] || { completed: 0, total: sub.totalQuestions, ratio: 0 };
      return `
        <div data-subtopic-id="${sub.id}" class="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg hover:bg-slate-50 cursor-pointer active:bg-slate-100 transition-colors">
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-slate-700 truncate">${sub.title}</p>
            <div class="mt-1.5">${progressBarHTML(p.ratio, { colorClass: 'bg-emerald-500', showLabel: true, completed: p.completed, total: p.total })}</div>
          </div>
          <svg class="w-4 h-4 text-slate-300 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </div>`;
    })
    .join('');

  return `
    <div data-topic-card class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button data-toggle-topic class="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left">
        <div class="flex-1 min-w-0">
          <h2 class="text-sm font-semibold text-slate-800">${topic.title}</h2>
          <div class="mt-1.5">${progressBarHTML(topicProgress.ratio, { colorClass: 'bg-indigo-400', showLabel: true, completed: topicProgress.completed, total: topicProgress.total })}</div>
        </div>
        <svg data-chevron class="w-4 h-4 text-slate-400 flex-shrink-0 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div data-topic-body class="border-t border-slate-100 px-1.5 pb-1.5">
        ${subtopicsHTML}
      </div>
    </div>`;
}
