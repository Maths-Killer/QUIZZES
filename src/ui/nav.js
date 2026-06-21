/**
 * nav.js — Persistent Bottom Bar (mobile) / Collapsible Sidebar (desktop).
 *
 * Single source of truth for the 5 main-menu items. Mounted once at boot;
 * never re-rendered (only the `nav-active` class toggles as views change),
 * so this never causes a flash/rebuild of nav DOM during navigation.
 */

const NAV_ITEMS = [
  { view: 'home', label: 'Study Home', icon: iconHome() },
  { view: 'quizBuilder', label: 'Quiz Builder', icon: iconBuilder() },
  { view: 'reviewMatrix', label: 'Review Matrix', icon: iconReview() },
  { view: 'search', label: 'Search', icon: iconSearch() },
  { view: 'dataPortal', label: 'Data Portal', icon: iconPortal() },
];

export function mountNav(router) {
  const existingMobile = document.getElementById('bottom-bar');
  const existingDesktop = document.getElementById('sidebar');
  if (existingMobile) existingMobile.remove();
  if (existingDesktop) existingDesktop.remove();

  document.body.appendChild(buildBottomBar(router));
  document.body.appendChild(buildSidebar(router));
}

function buildBottomBar(router) {
  const nav = document.createElement('nav');
  nav.id = 'bottom-bar';
  nav.className =
    'md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 flex justify-between px-1 pb-[env(safe-area-inset-bottom)]';

  NAV_ITEMS.forEach((item) => {
    const btn = document.createElement('button');
    btn.setAttribute('data-nav-item', item.view);
    btn.className =
      'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium text-slate-500 nav-active:text-indigo-600 transition-colors';
    btn.innerHTML = `<span class="w-6 h-6">${item.icon}</span><span>${item.label}</span>`;
    btn.addEventListener('click', () => router.navigateTo(item.view));
    nav.appendChild(btn);
  });

  return nav;
}

function buildSidebar(router) {
  const aside = document.createElement('aside');
  aside.id = 'sidebar';
  aside.className =
    'hidden md:flex md:flex-col fixed top-0 left-0 h-full w-64 bg-white border-r border-slate-200 z-40 transition-[width] duration-200';
  aside.setAttribute('data-collapsed', 'false');

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between px-4 h-16 border-b border-slate-200';
  header.innerHTML = `<span class="font-bold text-lg text-slate-800 sidebar-label">QuizBank</span>`;

  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'p-2 rounded hover:bg-slate-100 text-slate-500';
  collapseBtn.innerHTML = iconCollapse();
  collapseBtn.addEventListener('click', () => toggleSidebar(aside));
  header.appendChild(collapseBtn);
  aside.appendChild(header);

  const list = document.createElement('div');
  list.className = 'flex-1 py-3 flex flex-col gap-1 px-2';

  NAV_ITEMS.forEach((item) => {
    const btn = document.createElement('button');
    btn.setAttribute('data-nav-item', item.view);
    btn.className =
      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 nav-active:bg-indigo-50 nav-active:text-indigo-700 transition-colors';
    btn.innerHTML = `<span class="w-5 h-5 flex-shrink-0">${item.icon}</span><span class="sidebar-label">${item.label}</span>`;
    btn.addEventListener('click', () => router.navigateTo(item.view));
    list.appendChild(btn);
  });

  aside.appendChild(list);
  return aside;
}

function toggleSidebar(aside) {
  const collapsed = aside.getAttribute('data-collapsed') === 'true';
  aside.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
  aside.classList.toggle('w-64', collapsed);
  aside.classList.toggle('w-[68px]', !collapsed);
  aside.querySelectorAll('.sidebar-label').forEach((el) => {
    el.classList.toggle('hidden', !collapsed);
  });
}

// Minimal inline SVG icon set (no external icon font dependency).
function iconHome() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>`;
}
function iconBuilder() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h4"/><path d="M9 22V11"/><rect x="13" y="2" width="8" height="9" rx="1"/><path d="M13 22v-7a2 2 0 0 1 2-2h6"/></svg>`;
}
function iconReview() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;
}
function iconSearch() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;
}
function iconPortal() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m16 6-4 4-4-4"/><path d="M16 18a4 4 0 0 0-8 0"/></svg>`;
}
function iconCollapse() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;
}
