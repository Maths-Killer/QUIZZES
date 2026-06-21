/**
 * views/resumeOverlay.js — "Resume Session?" full-view layer.
 *
 * Note on the "no popups" rule: this is rendered as a full-page view that
 * REPLACES the home screen on boot (per spec: "bypass the home screen and
 * mount a Resume Session? overlay"), not as a floating modal on top of
 * other content. It owns the entire viewport until the user picks an
 * action, consistent with the rest of the app's full-view navigation model.
 */

export function renderResumeOverlay(appRootEl, { onResume, onDiscard }) {
  appRootEl.querySelectorAll(':scope > main, :scope > #resume-overlay').forEach((el) => el.remove());

  const overlay = document.createElement('main');
  overlay.id = 'resume-overlay';
  overlay.className = 'min-h-screen flex flex-col items-center justify-center px-6 text-center';
  overlay.innerHTML = `
    <div class="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
      <svg class="w-8 h-8 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
    </div>
    <h1 class="text-lg font-bold text-slate-800 mb-1">Resume Session?</h1>
    <p class="text-sm text-slate-500 mb-6 max-w-sm">You have an unfinished quiz in progress. Pick up right where you left off, or start fresh.</p>
    <div class="flex flex-col gap-2 w-full max-w-xs">
      <button id="resume-btn" class="bg-indigo-600 text-white font-semibold py-3 rounded-xl active:bg-indigo-700 transition-colors">Resume Quiz</button>
      <button id="discard-btn" class="text-slate-500 text-sm font-medium py-2">Discard &amp; Go Home</button>
    </div>`;

  appRootEl.appendChild(overlay);

  overlay.querySelector('#resume-btn').addEventListener('click', onResume);
  overlay.querySelector('#discard-btn').addEventListener('click', onDiscard);
}
