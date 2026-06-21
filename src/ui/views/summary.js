/**
 * views/summary.js — High-density "Summary Primer" for a subtopic.
 *
 * Render order:
 * 1. Topic-level summaryText (if present) — a chapter overview card shown
 *    once, above everything else, regardless of which subtopic is open.
 * 2. Subtopic-level summaryText (if present) — the textbook-style primer
 *    specific to this subtopic.
 * 3. The existing auto-generated question stack (questionText/explanation/
 *    reference per question) — ALWAYS rendered, never replaced. It serves
 *    as a fallback when no summaryText is authored, and as supplementary
 *    detail even when summaryText IS present, since summaryText is a
 *    hand-written overview while the question stack stays exhaustive.
 *
 * "Continue to Quiz" launches Pre-Quiz Configuration (quizSettings).
 */

import { getQuestionIdsForSubtopic, getQuestionsByIds } from '../../data/questionRepository.js';
import { getTopicMeta } from '../../db/seed.js';
import { renderTextWithImages, renderRichSummaryText } from '../../utils/textParser.js';
import { pageHeaderHTML, wireBackButton, emptyStateHTML } from '../components.js';

export async function renderSummary(container, params, router) {
  const { subtopicId } = params;

  container.innerHTML = `
    <div class="pb-28 md:pb-8 md:pl-64">
      ${pageHeaderHTML({ title: 'Summary Primer', showBack: true })}
      <div id="summary-body" class="px-4 md:px-8 py-4"></div>
    </div>
    <div id="continue-bar" class="fixed bottom-16 md:bottom-0 left-0 right-0 md:left-64 z-30 bg-white border-t border-slate-200 p-3 hidden">
      <button id="continue-to-quiz-btn" class="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl active:bg-indigo-700 transition-colors">
        Continue to Quiz
      </button>
    </div>`;

  wireBackButton(container, router);

  const body = container.querySelector('#summary-body');
  const topicMeta = await getTopicMeta();
  const subtopicInfo = findSubtopicInfo(topicMeta, subtopicId);

  if (!subtopicInfo) {
    body.innerHTML = emptyStateHTML('Subtopic not found.');
    return;
  }

  const ids = await getQuestionIdsForSubtopic(subtopicId);
  const questionMap = await getQuestionsByIds(ids);
  const questions = ids.map((id) => questionMap.get(id)).filter(Boolean);

  if (questions.length === 0) {
    body.innerHTML = emptyStateHTML('No questions in this subtopic yet.');
    return;
  }

  body.innerHTML = `
    <h2 class="text-lg font-bold text-slate-800 mb-1">${escapeText(subtopicInfo.title)}</h2>
    <p class="text-sm text-slate-500 mb-4">${questions.length} question${questions.length > 1 ? 's' : ''} in this subtopic</p>
    ${renderTopicSummaryCard(subtopicInfo)}
    ${renderSubtopicSummaryCard(subtopicInfo)}
    <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-2 mb-2">Question-by-Question Detail</h3>
    <div class="flex flex-col gap-3">
      ${questions.map((q, i) => renderPrimerCard(q, i + 1)).join('')}
    </div>`;

  container.querySelector('#continue-bar').classList.remove('hidden');
  container.querySelector('#continue-to-quiz-btn').addEventListener('click', () => {
    router.navigateTo('quizSettings', {
      filter: { subtopicIds: [subtopicId] },
      sourceLabel: subtopicInfo.title,
    });
  });

  if (window.MathJax?.typesetPromise) {
    window.MathJax.typesetPromise([body]).catch((err) => console.warn('MathJax typeset error:', err));
  }
}

/**
 * Chapter-level overview card. Returns '' (renders nothing) if the parent
 * topic has no summaryText — this is the graceful fallback Gemini's spec
 * asked for, applied at the topic level too.
 */
function renderTopicSummaryCard(subtopicInfo) {
  if (!subtopicInfo.topicSummaryText || !subtopicInfo.topicSummaryText.trim()) return '';
  return `
    <div class="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-3">
      <p class="text-[11px] font-semibold text-indigo-400 uppercase tracking-wide mb-1.5">${escapeText(subtopicInfo.topicTitle)} — Chapter Overview</p>
      <div class="text-sm text-slate-700 leading-relaxed whitespace-pre-line">${renderRichSummaryText(subtopicInfo.topicSummaryText)}</div>
    </div>`;
}

/**
 * Subtopic-level textbook-style primer card. Returns '' if summaryText is
 * undefined/empty for this subtopic — the UI falls through to showing
 * just the question stack, exactly as it did before this feature existed.
 */
function renderSubtopicSummaryCard(subtopicInfo) {
  if (!subtopicInfo.summaryText || !subtopicInfo.summaryText.trim()) return '';
  return `
    <div class="bg-white border border-slate-200 rounded-xl p-4 mb-4 shadow-sm">
      <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Summary</p>
      <div class="text-sm text-slate-700 leading-relaxed whitespace-pre-line">${renderRichSummaryText(subtopicInfo.summaryText)}</div>
    </div>`;
}

function renderPrimerCard(q, num) {
  return `
    <div class="bg-white rounded-xl border border-slate-200 p-4">
      <div class="flex items-start gap-2 mb-2">
        <span class="text-xs font-bold text-indigo-500 bg-indigo-50 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">${num}</span>
        <div class="text-sm text-slate-700 leading-relaxed">${renderTextWithImages(q.questionText)}</div>
      </div>
      ${
        q.explanation
          ? `<div class="mt-2 pl-7 text-xs text-slate-500 leading-relaxed border-l-2 border-slate-100 pl-3 ml-2.5">${renderTextWithImages(q.explanation)}</div>`
          : ''
      }
      ${q.reference ? `<p class="mt-2 pl-7 text-[11px] text-slate-400 italic">${escapeText(q.reference)}</p>` : ''}
    </div>`;
}

function escapeText(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function findSubtopicInfo(topicMeta, subtopicId) {
  for (const topic of topicMeta) {
    const sub = topic.subtopics.find((s) => s.id === subtopicId);
    if (sub) return { ...sub, topicTitle: topic.title, topicSummaryText: topic.summaryText || '' };
  }
  return null;
}
