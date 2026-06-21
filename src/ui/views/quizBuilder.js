/**
 * views/quizBuilder.js — Custom Quiz Builder.
 * Filter select menu by specific topics, subtopics, or a full randomized
 * bank mix. Resolves into the same quizSettings (Pre-Quiz Configuration)
 * flow used by the Summary Primer's "Continue to Quiz" button.
 */

import { getTopicMeta } from '../../db/seed.js';
import { pageHeaderHTML } from '../components.js';

export async function renderQuizBuilder(container, params, router) {
  container.innerHTML = `
    <div class="pb-28 md:pb-8 md:pl-64">
      ${pageHeaderHTML({ title: 'Custom Quiz Builder' })}
      <div class="px-4 md:px-8 py-4 max-w-xl">

        <div class="flex gap-2 mb-4" id="builder-mode-toggle">
          <button data-builder-mode="topics" class="builder-mode-btn flex-1 border-2 border-indigo-500 bg-indigo-50 text-indigo-700 rounded-xl p-2.5 text-sm font-semibold">By Topic/Subtopic</button>
          <button data-builder-mode="random" class="builder-mode-btn flex-1 border-2 border-slate-200 rounded-xl p-2.5 text-sm font-semibold">Full Random Mix</button>
        </div>

        <div id="topic-filter-panel" class="flex flex-col gap-2"></div>
        <div id="random-mix-panel" class="hidden bg-white rounded-xl border border-slate-200 p-4 text-sm text-slate-500">
          Pulls a randomized mix from the entire question bank, ignoring topic boundaries. Set the question count on the next screen.
        </div>

      </div>
    </div>
    <div class="fixed bottom-16 md:bottom-0 left-0 right-0 md:left-64 z-30 bg-white border-t border-slate-200 p-3">
      <button id="build-quiz-btn" class="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl active:bg-indigo-700 transition-colors disabled:opacity-50" disabled>
        Select topics or subtopics
      </button>
    </div>`;

  const topicMeta = await getTopicMeta();
  const filterPanel = container.querySelector('#topic-filter-panel');
  const randomPanel = container.querySelector('#random-mix-panel');
  const buildBtn = container.querySelector('#build-quiz-btn');

  const selected = { topicIds: new Set(), subtopicIds: new Set() };
  let builderMode = 'topics';

  filterPanel.innerHTML = topicMeta.map((topic) => renderTopicFilterCard(topic)).join('');

  function refreshBuildButton() {
    if (builderMode === 'random') {
      buildBtn.disabled = false;
      buildBtn.textContent = 'Build Full Random Quiz';
      return;
    }
    const count = selected.topicIds.size + selected.subtopicIds.size;
    buildBtn.disabled = count === 0;
    buildBtn.textContent = count === 0 ? 'Select topics or subtopics' : `Build Quiz (${count} selected)`;
  }

  filterPanel.querySelectorAll('[data-topic-checkbox]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const topicId = cb.getAttribute('data-topic-checkbox');
      if (cb.checked) selected.topicIds.add(topicId);
      else selected.topicIds.delete(topicId);
      refreshBuildButton();
    });
  });

  filterPanel.querySelectorAll('[data-subtopic-checkbox]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const subtopicId = cb.getAttribute('data-subtopic-checkbox');
      if (cb.checked) selected.subtopicIds.add(subtopicId);
      else selected.subtopicIds.delete(subtopicId);
      refreshBuildButton();
    });
  });

  container.querySelectorAll('.builder-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      builderMode = btn.getAttribute('data-builder-mode');
      container.querySelectorAll('.builder-mode-btn').forEach((b) => {
        const isActive = b === btn;
        b.classList.toggle('border-indigo-500', isActive);
        b.classList.toggle('bg-indigo-50', isActive);
        b.classList.toggle('text-indigo-700', isActive);
        b.classList.toggle('border-slate-200', !isActive);
      });
      filterPanel.classList.toggle('hidden', builderMode === 'random');
      randomPanel.classList.toggle('hidden', builderMode !== 'random');
      refreshBuildButton();
    });
  });

  buildBtn.addEventListener('click', () => {
    if (builderMode === 'random') {
      router.navigateTo('quizSettings', {
        filter: { fullRandomMix: true },
        sourceLabel: 'Full Randomized Bank Mix',
      });
      return;
    }

    const topicIds = Array.from(selected.topicIds);
    const subtopicIds = Array.from(selected.subtopicIds);
    const labelParts = [];
    if (topicIds.length) labelParts.push(`${topicIds.length} topic${topicIds.length > 1 ? 's' : ''}`);
    if (subtopicIds.length) labelParts.push(`${subtopicIds.length} subtopic${subtopicIds.length > 1 ? 's' : ''}`);

    router.navigateTo('quizSettings', {
      filter: { topicIds, subtopicIds },
      sourceLabel: `Custom Mix: ${labelParts.join(' + ')}`,
    });
  });

  refreshBuildButton();
}

function renderTopicFilterCard(topic) {
  return `
    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <label class="flex items-center gap-3 px-4 py-3 cursor-pointer">
        <input type="checkbox" data-topic-checkbox="${topic.id}" class="w-4 h-4 accent-indigo-600" />
        <span class="text-sm font-semibold text-slate-800 flex-1">${escapeText(topic.title)}</span>
        <span class="text-xs text-slate-400">${topic.totalQuestions} q</span>
      </label>
      <div class="border-t border-slate-100 px-2 pb-2">
        ${topic.subtopics
          .map(
            (sub) => `
          <label class="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 rounded-lg">
            <input type="checkbox" data-subtopic-checkbox="${sub.id}" class="w-4 h-4 accent-emerald-600" />
            <span class="text-sm text-slate-600 flex-1">${escapeText(sub.title)}</span>
            <span class="text-xs text-slate-400">${sub.totalQuestions} q</span>
          </label>`
          )
          .join('')}
      </div>
    </div>`;
}

function escapeText(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
