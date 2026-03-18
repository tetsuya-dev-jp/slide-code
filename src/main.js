/**
 * SlideCode — Main Application Entry Point
 * Wires together router, views, and theme
 */

import './styles/index.css';
import '@xterm/xterm/css/xterm.css';
import { Router } from './core/router.js';
import { getLastRoute, setLastRoute } from './core/preferences.js';
import { theme } from './core/theme.js';

const revealApp = () => {
  if (typeof window.__codestageBootTimeout === 'number') {
    window.clearTimeout(window.__codestageBootTimeout);
  }
  document.documentElement.setAttribute('data-app-ready', 'true');
};

const showBootFallback = (reason = 'bootstrap', error) => {
  if (typeof window.__codestageBootTimeout === 'number') {
    window.clearTimeout(window.__codestageBootTimeout);
  }
  if (error) {
    console.error(error);
  }
  if (typeof window.__codestageShowBootFallback === 'function') {
    window.__codestageShowBootFallback(reason);
    return;
  }
  document.documentElement.setAttribute('data-app-ready', 'error');
  document.documentElement.setAttribute('data-app-error', reason);
};

window.setTimeout(revealApp, 1800);

async function bootstrap() {
  // ============================
  // Theme
  // ============================

  theme.init();

  // ============================
  // Router + View Switching
  // ============================

  const initialHash = window.location.hash.trim();
  if (!initialHash || initialHash === '#') {
    const restoredRoute = getLastRoute();
    if (restoredRoute && restoredRoute !== '/') {
      window.history.replaceState(window.history.state, '', `#${restoredRoute}`);
    }
  }

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
  let navigationSequence = 0;

  const viewLoaders = {
    dashboard: () =>
      import('./views/dashboard.js').then(({ initDashboard }) => initDashboard(router)),
    presentation: () =>
      import('./views/presentation.js').then(({ initPresentation }) => initPresentation(router)),
    editor: () => import('./views/editor.js').then(({ initEditor }) => initEditor(router)),
  };

  const viewEls = {
    dashboard: document.getElementById('viewDashboard'),
    presentation: document.getElementById('viewPresentation'),
    editor: document.getElementById('viewEditor'),
  };

  const presentationToolbar = [
    document.getElementById('paneToggles'),
    document.getElementById('layoutPicker'),
    document.getElementById('editDeckBtn'),
    document.getElementById('slideNav'),
    document.getElementById('progressBar'),
    document.getElementById('slideTitle'),
  ];

  const dashboardToolbar = [document.getElementById('dashboardConfigBtn')];

  function showView(name) {
    Object.entries(viewEls).forEach(([key, el]) => {
      el.style.display = key === name ? '' : 'none';
    });
    const isPresentation = name === 'presentation';
    const isDashboard = name === 'dashboard';
    presentationToolbar.forEach((el) => (el.style.display = isPresentation ? '' : 'none'));
    dashboardToolbar.forEach((el) => (el.style.display = isDashboard ? '' : 'none'));
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

  async function activateView(name, show) {
    const navigationId = ++navigationSequence;
    showView(name);

    const view = await getView(name);
    if (navigationId !== navigationSequence) {
      return view;
    }

    await show(view, navigationId);
    return view;
  }

  router
    .setLeaveGuard(({ from, to }) => {
      const editor = viewInstances.editor;
      if (!editor?.confirmLeave) return true;
      return editor.confirmLeave({ from, to });
    })
    .setErrorHandler((err, context) => {
      console.error(err);
      if (context?.path && context.path !== '/') {
        void router.navigate('/');
      }
    });

  document.getElementById('themeToggle').addEventListener('click', () => {
    const next = theme.toggle();
    const isDark = next === 'dark';
    viewInstances.presentation?.applyTheme?.(isDark);
    viewInstances.editor?.applyTheme?.(isDark);
  });

  router
    .on('/', async () => {
      await activateView('dashboard', async (dashboard, navigationId) => {
        await dashboard.show({ navigationId });
      });
      setLastRoute('/');
    })
    .on('/deck/:id', async ({ id }) => {
      await activateView('presentation', async (presentation, navigationId) => {
        await presentation.show(id, { navigationId });
      });
      setLastRoute(`/deck/${id}`);
    })
    .on('/deck/:id/edit', async ({ id }) => {
      await activateView('editor', async (editor, navigationId) => {
        await editor.show(id, { navigationId });
      });
      setLastRoute(`/deck/${id}/edit`);
    })
    .start();

  requestAnimationFrame(revealApp);

  const defaultStyle = document.querySelector('link[href="/style.css"]');
  if (defaultStyle) defaultStyle.remove();
}

bootstrap().catch((error) => {
  showBootFallback('bootstrap', error);
});
