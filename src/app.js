/**
 * app.js — DOM Router controller.
 *
 * Navigation model (per spec):
 * - No popups/popovers/modals. Every transition swaps the entire #app-view
 *   container's content for a new full-page template.
 * - Active View History Stack: a plain array of { view, params } entries.
 *   Pushing happens on every "forward" navigation (Home -> Summary, Summary
 *   -> Quiz, Quiz -> Related Question). Back navigation pops the stack and
 *   re-renders whatever was there, restoring quiz state via quizEngine
 *   where relevant.
 * - This is intentionally NOT a URL-hash router. The spec describes an
 *   explicitly managed in-memory stack, and tying that to browser history
 *   would fight with back-button semantics for the quiz-state restoration
 *   precision the spec calls for. Browser back/forward are left alone;
 *   in-app navigation is fully self-contained.
 */

import './styles.css';

import db from './db/db.js';
import { ensureSeeded } from './db/seed.js';
import * as quizEngine from './engine/quizEngine.js';

import { renderHome } from './ui/views/home.js';
import { renderSummary } from './ui/views/summary.js';
import { renderQuizSettings } from './ui/views/quizSettings.js';
import { renderQuiz } from './ui/views/quiz.js';
import { renderResult } from './ui/views/result.js';
import { renderQuizBuilder } from './ui/views/quizBuilder.js';
import { renderReviewMatrix } from './ui/views/reviewMatrix.js';
import { renderSearch } from './ui/views/search.js';
import { renderDataPortal } from './ui/views/dataPortal.js';
import { renderResumeOverlay } from './ui/views/resumeOverlay.js';
import { mountNav } from './ui/nav.js';

const VIEW_RENDERERS = {
  home: renderHome,
  summary: renderSummary,
  quizSettings: renderQuizSettings,
  quiz: renderQuiz,
  result: renderResult,
  quizBuilder: renderQuizBuilder,
  reviewMatrix: renderReviewMatrix,
  search: renderSearch,
  dataPortal: renderDataPortal,
};

/** The Active View History Stack Array — exported as a frozen-shape accessor, never mutated from outside. */
const historyStack = [];

let appRootEl = null;
let currentViewEl = null;
let quizTickIntervalId = null;

/**
 * Public navigation API passed into every view renderer, so views never
 * import app.js directly (avoids circular imports) — they just call the
 * methods on the `router` object they're handed.
 */
const router = {
  /** Forward navigation: pushes the CURRENT view onto the stack, then renders the new one. */
  navigateTo(view, params = {}) {
    if (currentViewEl) {
      historyStack.push({ view: currentViewEl.view, params: currentViewEl.params });
    }
    renderView(view, params);
  },

  /** Pops the stack and re-renders whatever was there. No-op (stays put) if stack is empty. */
  goBack() {
    const previous = historyStack.pop();
    if (!previous) return;
    renderView(previous.view, previous.params, { isBack: true });
  },

  /** Replaces the current view without touching the stack (used for in-place refreshes, e.g. after submitting a question). */
  replaceCurrentView(view, params = {}) {
    renderView(view, params, { isReplace: true });
  },

  /**
   * Special-cased entry point for the "Related Question" flow described in
   * the spec: pushes the FULL quiz engine state (not just the view route)
   * so "Return to Parent Quiz" restores with pinpoint precision.
   */
  navigateToRelatedQuestion(questionId) {
    quizEngine.pushRelatedSnapshot();
    historyStack.push({ view: 'quiz', params: { isRelatedParent: true } });
    renderView('quiz', { relatedQuestionId: questionId, isRelatedChild: true });
  },

  /** Called by the "Return to Parent Quiz" button. */
  returnToParentQuiz() {
    const restored = quizEngine.popRelatedSnapshot();
    historyStack.pop(); // discard the marker pushed in navigateToRelatedQuestion
    if (restored) {
      renderView('quiz', {}, { isBack: true });
    }
  },

  hasParentQuiz: () => quizEngine.hasParentQuiz(),
  canGoBack: () => historyStack.length > 0,
  getStackDepth: () => historyStack.length,
};

/**
 * Core render dispatcher. Tears down any running quiz timer interval
 * before mounting a new view (prevents orphaned intervals from a previous
 * quiz session ticking against a detached DOM).
 */
function renderView(view, params = {}, opts = {}) {
  const renderer = VIEW_RENDERERS[view];
  if (!renderer) {
    console.error(`Unknown view: "${view}"`);
    return;
  }

  stopQuizTimerLoop();

  currentViewEl = { view, params };

  // Full-view swap — per spec, never a modal/overlay for primary navigation.
  appRootEl.querySelectorAll(':scope > main').forEach((el) => el.remove());

  const mainEl = document.createElement('main');
  mainEl.className = 'app-view-main';
  mainEl.setAttribute('data-view', view);
  appRootEl.appendChild(mainEl);

  renderer(mainEl, params, router, { isBack: !!opts.isBack, isReplace: !!opts.isReplace });

  // Re-typeset any LaTeX in the freshly-injected HTML. MathJax is configured
  // with startup.typeset = false in index.html specifically because content
  // arrives via innerHTML after MathJax has already loaded — this call is
  // what actually triggers rendering. Guarded because MathJax loads async
  // from a CDN and may not be ready on the very first render.
  if (window.MathJax?.typesetPromise) {
    window.MathJax.typesetPromise([mainEl]).catch((err) => console.warn('MathJax typeset error:', err));
  }

  if (view === 'quiz') {
    startQuizTimerLoopIfNeeded();
  }

  updateNavActiveState(view);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function updateNavActiveState(view) {
  document.querySelectorAll('[data-nav-item]').forEach((el) => {
    el.classList.toggle('nav-active', el.getAttribute('data-nav-item') === view);
  });
}

// ---------------------------------------------------------------------------
// Quiz timer loop — ticks quizEngine state once per second while the quiz
// view is mounted, persists to IndexedDB periodically (not every tick, to
// avoid hammering IndexedDB 1x/sec for the whole quiz duration).
// ---------------------------------------------------------------------------

function startQuizTimerLoopIfNeeded() {
  if (!quizEngine.hasActiveQuiz()) return;
  const state = quizEngine.serialize();
  if (state.timerMode === quizEngine.TimerMode.UNTIMED) return;

  let ticksSinceLastPersist = 0;

  quizTickIntervalId = setInterval(() => {
    const updated = quizEngine.tickTimer();
    document.dispatchEvent(new CustomEvent('quiz-timer-tick', { detail: updated }));

    ticksSinceLastPersist += 1;
    if (ticksSinceLastPersist >= 5) {
      quizEngine.persistSession();
      ticksSinceLastPersist = 0;
    }

    if (updated.remainingSeconds === 0) {
      stopQuizTimerLoop();
      document.dispatchEvent(new CustomEvent('quiz-timer-expired'));
    }
  }, 1000);
}

function stopQuizTimerLoop() {
  if (quizTickIntervalId !== null) {
    clearInterval(quizTickIntervalId);
    quizTickIntervalId = null;
  }
}

// ---------------------------------------------------------------------------
// Session persistence wiring (visibilitychange / beforeunload)
// ---------------------------------------------------------------------------

/**
 * Listens for the custom event quiz.js dispatches instead of importing
 * app.js directly (avoids a circular import: app.js -> views/quiz.js ->
 * app.js). This is the single bridge point between quiz-internal actions
 * (submit, jump to related question, return to parent) and the router.
 */
function wireQuizNavigationBridge() {
  document.addEventListener('app-navigate-request', async (event) => {
    const { target, ...detail } = event.detail;

    if (target === '__related__') {
      router.navigateToRelatedQuestion(detail.relatedId);
    } else if (target === '__return_to_parent__') {
      router.returnToParentQuiz();
    } else {
      router.navigateTo(target, detail);
    }
  });
}

function wireSessionPersistence() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && quizEngine.hasActiveQuiz()) {
      quizEngine.persistSession();
    }
  });

  window.addEventListener('beforeunload', () => {
    if (quizEngine.hasActiveQuiz()) {
      // Synchronous best-effort: IndexedDB writes are async and may not
      // complete before unload, but the visibilitychange handler above
      // covers the common "tab hidden before close" case. This is a
      // belt-and-suspenders second attempt for the same-tick close case.
      quizEngine.persistSession();
    }
  });
}

// ---------------------------------------------------------------------------
// Splash screen
// ---------------------------------------------------------------------------

function dismissSplashScreen() {
  const splash = document.getElementById('splash-screen');
  if (!splash) return;
  splash.classList.add('splash-fade-out');
  setTimeout(() => splash.remove(), 400);
}

// ---------------------------------------------------------------------------
// Boot sequence
// ---------------------------------------------------------------------------

async function boot() {
  appRootEl = document.getElementById('app-root');

  await db.openDB();
  await ensureSeeded();

  mountNav(router);
  wireSessionPersistence();
  wireQuizNavigationBridge();

  const resumable = await quizEngine.findResumableSession();

  if (resumable) {
    renderResumeOverlay(appRootEl, {
      onResume: () => {
        quizEngine.restore(resumable);
        renderView('quiz', {});
        dismissSplashScreen();
      },
      onDiscard: async () => {
        await quizEngine.clearPersistedSession();
        quizEngine.discardActiveQuiz();
        renderView('home', {});
        dismissSplashScreen();
      },
    });
  } else {
    renderView('home', {});
    dismissSplashScreen();
  }
}

boot().catch((err) => {
  console.error('Fatal boot error:', err);
  dismissSplashScreen();
  const root = document.getElementById('app-root');
  if (root) {
    root.innerHTML = `<main class="p-6 text-center text-red-600">
      <p class="font-semibold">Something went wrong loading the app.</p>
      <p class="text-sm mt-2 text-slate-500">${err.message ?? 'Unknown error'}</p>
    </main>`;
  }
});

export { router };
