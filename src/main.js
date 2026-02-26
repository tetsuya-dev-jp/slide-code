/**
 * CodeStage — Main Application Entry Point
 * Wires together router, views, and theme
 */

import './styles/index.css';
import '@xterm/xterm/css/xterm.css';
import { Router } from './core/router.js';
import { theme } from './core/theme.js';
import { initDashboard } from './views/dashboard.js';
import { initPresentation } from './views/presentation.js';
import { initEditor } from './views/editor.js';

// ============================
// Theme
// ============================

theme.init();

// ============================
// Router + View Switching
// ============================

const router = new Router();

const viewEls = {
  dashboard: document.getElementById('viewDashboard'),
  presentation: document.getElementById('viewPresentation'),
  editor: document.getElementById('viewEditor'),
};

// Presentation-only toolbar elements
const presentationToolbar = [
  document.getElementById('paneToggles'),
  document.getElementById('layoutPicker'),
  document.getElementById('slideNav'),
  document.getElementById('progressBar'),
  document.getElementById('slideTitle'),
];

function showView(name) {
  Object.entries(viewEls).forEach(([key, el]) => {
    el.style.display = key === name ? '' : 'none';
  });
  const isPresentation = name === 'presentation';
  presentationToolbar.forEach(el => el.style.display = isPresentation ? '' : 'none');
}

// ============================
// Initialize Views
// ============================

const dashboard = initDashboard(router);
const presentation = initPresentation(router);
const editor = initEditor(router);

// Theme toggle
document.getElementById('themeToggle').addEventListener('click', () => {
  const next = theme.toggle();
  const isDark = next === 'dark';
  if (presentation.shellPane) presentation.shellPane.setTheme(isDark);
  editor.setMonacoTheme(isDark);
  if (presentation.slideManager) presentation.slideManager.emit();
});

// ============================
// Routes
// ============================

router
  .on('/', () => {
    showView('dashboard');
    dashboard.show();
  })
  .on('/deck/:id', ({ id }) => {
    showView('presentation');
    presentation.show(id);
  })
  .on('/deck/:id/edit', ({ id }) => {
    showView('editor');
    editor.show(id);
  })
  .start();

// Remove Vite default styles
const defaultStyle = document.querySelector('link[href="/style.css"]');
if (defaultStyle) defaultStyle.remove();
