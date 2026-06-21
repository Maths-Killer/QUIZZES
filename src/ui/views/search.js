/**
 * views/search.js — Search Center.
 * Live text scanner looking up terms globally across all question data.
 * Debounced input -> in-memory search index (see questionRepository.js).
 */

import { searchQuestions, getQuestionsByIds } from '../../data/questionRepository.js';
import { getTopicMeta } from '../../db/seed.js';
import { stripImageTokens } from '../../utils/textParser.js';
import { pageHeaderHTML, emptyStateHTML } from '../components.js';

export async function renderSearch(container, params, router) {
  container.innerHTML = `
    <div class="pb-24 md:pb-8 md:pl-64">
      ${pageHeaderHTML({ title: 'Search Center' })}
      <div class="px-4 md:px-8 py-4">
        <div class="relative mb-4">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input id="search-input" type="text" placeholder="Search question text, options, references…" class="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400" autocomplete="off" />
        </div>
        <div id="search-results"></div>
      </div>
    </div>`;

  const input = container.querySelector('#search-input');
  const resultsEl = container.querySelector('#search-results');
  const topicMeta = await getTopicMeta();
  const subtopicTitleMap = buildSubtopicTitleMap(topicMeta);

  resultsEl.innerHTML = emptyStateHTML('Type to search across the entire question bank.');

  let debounceTimer = null;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runSearch(input.value), 200);
  });

  async function runSearch(query) {
    const trimmed = query.trim();
    if (!trimmed) {
      resultsEl.innerHTML = emptyStateHTML('Type to search across the entire question bank.');
      return;
    }

    const matches = await searchQuestions(trimmed);

    if (matches.length === 0) {
      resultsEl.innerHTML = emptyStateHTML(`No results for "${escapeText(trimmed)}".`);
      return;
    }

    const questionMap = await getQuestionsByIds(matches.map((m) => m.id));

    resultsEl.innerHTML = `
      <p class="text-xs text-slate-400 mb-2">${matches.length} result${matches.length > 1 ? 's' : ''}</p>
      <div class="flex flex-col gap-2">
        ${matches
          .map((m) => {
            const q = questionMap.get(m.id);
            if (!q) return '';
            return `
            <button data-search-result-id="${q.id}" class="text-left bg-white border border-slate-200 rounded-xl px-4 py-3 hover:bg-slate-50">
              <p class="text-xs text-indigo-500 font-medium mb-1">${escapeText(subtopicTitleMap[q.subtopicId] || q.subtopicId)}</p>
              <p class="text-sm text-slate-700">${escapeText(truncate(stripImageTokens(q.questionText), 140))}</p>
            </button>`;
          })
          .join('')}
      </div>`;

    resultsEl.querySelectorAll('[data-search-result-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        router.navigateTo('quiz', { isRelatedChild: true, relatedQuestionId: btn.getAttribute('data-search-result-id') });
      });
    });
  }
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

function truncate(str, max) {
  return str.length > max ? str.slice(0, max).trim() + '…' : str;
}

function escapeText(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
