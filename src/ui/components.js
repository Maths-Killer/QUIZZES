/**
 * components.js — Small shared DOM-building helpers used across views.
 * Kept framework-free (plain string templates / DOM nodes) per the
 * Vanilla JS constraint in the spec.
 */

/**
 * Animated horizontal progress bar. Returns an HTML string (not a node)
 * since most call sites are composing larger innerHTML blocks for list
 * rendering — for 5,000+ questions, building hundreds of these as real
 * DOM nodes one at a time would be slower than templating + one innerHTML
 * assignment.
 *
 * @param {number} ratio - 0..1
 * @param {object} [opts]
 * @param {string} [opts.colorClass] - tailwind bg-* class for the fill
 * @param {boolean} [opts.showLabel] - render "x/y" text alongside
 * @param {number} [opts.completed]
 * @param {number} [opts.total]
 */
export function progressBarHTML(ratio, opts = {}) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  const colorClass = opts.colorClass || 'bg-indigo-500';
  const label =
    opts.showLabel && opts.total !== undefined
      ? `<span class="text-xs text-slate-500 tabular-nums">${opts.completed ?? 0}/${opts.total}</span>`
      : '';

  return `
    <div class="flex items-center gap-2 w-full">
      <div class="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div class="h-full ${colorClass} rounded-full transition-[width] duration-500 ease-out" style="width: ${pct}%"></div>
      </div>
      ${label}
    </div>`;
}

/** Small colored pill, e.g. for status badges on review reel items. */
export function badgeHTML(text, variant = 'neutral') {
  const variants = {
    neutral: 'bg-slate-100 text-slate-600',
    success: 'bg-emerald-100 text-emerald-700',
    danger: 'bg-rose-100 text-rose-700',
    warning: 'bg-amber-100 text-amber-700',
  };
  return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${variants[variant] || variants.neutral}">${text}</span>`;
}

/** Formats seconds as HH:MM:SS (or MM:SS if under an hour) for timer displays. */
export function formatDuration(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined) return '--:--';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Generic full-view page header with optional back button — used by most views for visual consistency. */
export function pageHeaderHTML({ title, subtitle, showBack }) {
  return `
    <header class="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 px-4 py-3 flex items-center gap-3">
      ${
        showBack
          ? `<button data-action="back" class="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 flex-shrink-0">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
            </button>`
          : ''
      }
      <div class="min-w-0">
        <h1 class="text-base font-semibold text-slate-800 truncate">${title}</h1>
        ${subtitle ? `<p class="text-xs text-slate-500 truncate">${subtitle}</p>` : ''}
      </div>
    </header>`;
}

/** Wires up any [data-action="back"] button inside a container to router.goBack(). */
export function wireBackButton(containerEl, router) {
  const btn = containerEl.querySelector('[data-action="back"]');
  if (btn) btn.addEventListener('click', () => router.goBack());
}

export function emptyStateHTML(message, iconSvg = '') {
  return `
    <div class="flex flex-col items-center justify-center text-center py-16 px-6 text-slate-400">
      ${iconSvg ? `<div class="w-12 h-12 mb-3">${iconSvg}</div>` : ''}
      <p class="text-sm">${message}</p>
    </div>`;
}
