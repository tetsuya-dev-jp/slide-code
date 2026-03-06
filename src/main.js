/**
 * SlideCode — Main Application Entry Point
 * Wires together router, views, and theme
 */

import './styles/index.css';
import '@xterm/xterm/css/xterm.css';
import { Router } from './core/router.js';
import { theme } from './core/theme.js';

const revealApp = () => {
  document.documentElement.setAttribute('data-app-ready', 'true');
};

window.setTimeout(revealApp, 1800);

// ============================
// Theme
// ============================

theme.init();

// ============================
// Router + View Switching
// ============================

const router = new Router();
const viewInstances = {
  dashboard: null,
  presentation: null,
  editor: null,
};
const viewPromises = {
  dashboard: null,
  presentation: null,
  editor: null,
};

const viewLoaders = {
  dashboard: () => import('./views/dashboard.js').then(({ initDashboard }) => initDashboard(router)),
  presentation: () => import('./views/presentation.js').then(({ initPresentation }) => initPresentation(router)),
  editor: () => import('./views/editor.js').then(({ initEditor }) => initEditor(router)),
};

const viewEls = {
  dashboard: document.getElementById('viewDashboard'),
  presentation: document.getElementById('viewPresentation'),
  editor: document.getElementById('viewEditor'),
};

// Presentation-only toolbar elements
const presentationToolbar = [
  document.getElementById('paneToggles'),
  document.getElementById('layoutPicker'),
  document.getElementById('editDeckBtn'),
  document.getElementById('slideNav'),
  document.getElementById('progressBar'),
  document.getElementById('slideTitle'),
];

const dashboardToolbar = [
  document.getElementById('dashboardConfigBtn'),
];

function showView(name) {
  Object.entries(viewEls).forEach(([key, el]) => {
    el.style.display = key === name ? '' : 'none';
  });
  const isPresentation = name === 'presentation';
  const isDashboard = name === 'dashboard';
  presentationToolbar.forEach(el => el.style.display = isPresentation ? '' : 'none');
  dashboardToolbar.forEach(el => el.style.display = isDashboard ? '' : 'none');
}

async function getView(name) {
  if (!viewLoaders[name]) {
    throw new Error(`Unknown view: ${name}`);
  }

  if (!viewInstances[name]) {
    viewPromises[name] ??= viewLoaders[name]()
      .then((view) => {
        viewInstances[name] = view;
        return view;
      })
      .catch((err) => {
        viewPromises[name] = null;
        throw err;
      });
    return viewPromises[name];
  }

  return viewInstances[name];
}

// Theme toggle
document.getElementById('themeToggle').addEventListener('click', () => {
  const next = theme.toggle();
  const isDark = next === 'dark';
  viewInstances.presentation?.applyTheme?.(isDark);
  viewInstances.editor?.applyTheme?.(isDark);
});

// ============================
// Routes
// ============================

router
  .on('/', async () => {
    showView('dashboard');
    const dashboard = await getView('dashboard');
    dashboard.show();
  })
  .on('/deck/:id', async ({ id }) => {
    showView('presentation');
    const presentation = await getView('presentation');
    presentation.show(id);
  })
  .on('/deck/:id/edit', async ({ id }) => {
    showView('editor');
    const editor = await getView('editor');
    editor.show(id);
  })
  .start();

requestAnimationFrame(revealApp);

// Remove Vite default styles
const defaultStyle = document.querySelector('link[href="/style.css"]');
if (defaultStyle) defaultStyle.remove();
