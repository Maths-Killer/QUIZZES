/**
 * views/dataPortal.js — In-App Data Portal.
 * Real-time entry of a single question object, or a bulk import textarea
 * for raw text arrays, with a required example structure block displayed.
 */

import { importQuestions, EXAMPLE_SCHEMA_BLOCK } from '../../data/questionRepository.js';
import { pageHeaderHTML } from '../components.js';

export async function renderDataPortal(container, params, router) {
  container.innerHTML = `
    <div class="pb-24 md:pb-8 md:pl-64">
      ${pageHeaderHTML({ title: 'Data Portal' })}
      <div class="px-4 md:px-8 py-4 max-w-2xl flex flex-col gap-4">

        <div class="flex gap-2" id="portal-mode-toggle">
          <button data-portal-mode="single" class="portal-mode-btn flex-1 border-2 border-indigo-500 bg-indigo-50 text-indigo-700 rounded-xl p-2.5 text-sm font-semibold">Single Entry</button>
          <button data-portal-mode="bulk" class="portal-mode-btn flex-1 border-2 border-slate-200 rounded-xl p-2.5 text-sm font-semibold">Bulk Import</button>
        </div>

        <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">
          <p class="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Required Example Structure</p>
          <pre class="text-[11px] text-slate-600 overflow-x-auto whitespace-pre leading-relaxed">${escapeText(EXAMPLE_SCHEMA_BLOCK)}</pre>
        </div>

        <div id="single-entry-panel" class="bg-white rounded-xl border border-slate-200 p-4">
          <textarea id="single-entry-textarea" rows="14" placeholder="Paste a single question object here…" class="w-full text-xs font-mono border border-slate-200 rounded-lg p-3 focus:outline-none focus:border-indigo-400"></textarea>
        </div>

        <div id="bulk-import-panel" class="hidden bg-white rounded-xl border border-slate-200 p-4">
          <textarea id="bulk-import-textarea" rows="14" placeholder="Paste a JSON array of question objects here…" class="w-full text-xs font-mono border border-slate-200 rounded-lg p-3 focus:outline-none focus:border-indigo-400"></textarea>
        </div>

        <div id="import-feedback" class="hidden rounded-xl p-3 text-sm"></div>

        <button id="import-btn" class="bg-indigo-600 text-white font-semibold py-3 rounded-xl active:bg-indigo-700 transition-colors">
          Import
        </button>
      </div>
    </div>`;

  let portalMode = 'single';
  const singlePanel = container.querySelector('#single-entry-panel');
  const bulkPanel = container.querySelector('#bulk-import-panel');
  const feedbackEl = container.querySelector('#import-feedback');
  const importBtn = container.querySelector('#import-btn');

  container.querySelectorAll('.portal-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      portalMode = btn.getAttribute('data-portal-mode');
      container.querySelectorAll('.portal-mode-btn').forEach((b) => {
        const isActive = b === btn;
        b.classList.toggle('border-indigo-500', isActive);
        b.classList.toggle('bg-indigo-50', isActive);
        b.classList.toggle('text-indigo-700', isActive);
        b.classList.toggle('border-slate-200', !isActive);
      });
      singlePanel.classList.toggle('hidden', portalMode !== 'single');
      bulkPanel.classList.toggle('hidden', portalMode !== 'bulk');
      hideFeedback();
    });
  });

  importBtn.addEventListener('click', async () => {
    const raw =
      portalMode === 'single'
        ? container.querySelector('#single-entry-textarea').value
        : container.querySelector('#bulk-import-textarea').value;

    if (!raw.trim()) {
      showFeedback('Paste a question object (or array of objects) before importing.', 'danger');
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      showFeedback(`Invalid JSON: ${err.message}`, 'danger');
      return;
    }

    importBtn.disabled = true;
    importBtn.textContent = 'Importing…';

    try {
      const { imported, errors } = await importQuestions(parsed);

      if (imported > 0 && errors.length === 0) {
        showFeedback(`Successfully imported ${imported} question${imported > 1 ? 's' : ''}.`, 'success');
        if (portalMode === 'single') {
          container.querySelector('#single-entry-textarea').value = '';
        } else {
          container.querySelector('#bulk-import-textarea').value = '';
        }
      } else if (imported > 0 && errors.length > 0) {
        showFeedback(
          `Imported ${imported} question${imported > 1 ? 's' : ''}, but ${errors.length} entr${errors.length > 1 ? 'ies' : 'y'} failed validation:\n` +
            errors.map((e) => `#${e.index}: ${e.errors.join('; ')}`).join('\n'),
          'warning'
        );
      } else {
        showFeedback(
          'No questions imported. Validation errors:\n' + errors.map((e) => `#${e.index}: ${e.errors.join('; ')}`).join('\n'),
          'danger'
        );
      }
    } finally {
      importBtn.disabled = false;
      importBtn.textContent = 'Import';
    }
  });

  function showFeedback(message, variant) {
    const variants = {
      success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      warning: 'bg-amber-50 text-amber-700 border border-amber-200',
      danger: 'bg-rose-50 text-rose-700 border border-rose-200',
    };
    feedbackEl.className = `rounded-xl p-3 text-sm whitespace-pre-line ${variants[variant]}`;
    feedbackEl.textContent = message;
    feedbackEl.classList.remove('hidden');
  }

  function hideFeedback() {
    feedbackEl.classList.add('hidden');
  }
}

function escapeText(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
