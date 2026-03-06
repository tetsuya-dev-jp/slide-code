import { afterEach, describe, expect, test, vi } from 'vitest';
import { Router } from './router.js';

const routers = [];

afterEach(() => {
  while (routers.length) {
    routers.pop().dispose();
  }
  window.history.replaceState(window.history.state, '', '#/');
});

function createRouter() {
  const router = new Router();
  routers.push(router);
  return router;
}

async function flushHashChange() {
  await new Promise(resolve => window.setTimeout(resolve, 0));
}

describe('Router', () => {
  test('blocks navigation when leave guard denies the route change', async () => {
    window.history.replaceState(window.history.state, '', '#/editor');
    const router = createRouter();
    router.setLeaveGuard(() => false);

    const allowed = await router.navigate('/dashboard');

    expect(allowed).toBe(false);
    expect(window.location.hash).toBe('#/editor');
  });

  test('does not evaluate leave guard twice for navigate', async () => {
    window.history.replaceState(window.history.state, '', '#/editor');
    const guard = vi.fn(() => true);
    const handler = vi.fn();
    const router = createRouter();
    router
      .setLeaveGuard(guard)
      .on('/dashboard', handler);

    const allowed = await router.navigate('/dashboard');
    await flushHashChange();

    expect(allowed).toBe(true);
    expect(guard).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('reports async route handler failures without unhandled rejections', async () => {
    const onError = vi.fn();
    const router = createRouter();
    router
      .setErrorHandler(onError)
      .on('/boom', async () => {
        throw new Error('boom');
      });

    await router.navigate('/boom');
    await flushHashChange();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe('boom');
  });

  test('replace updates current path without triggering navigation', () => {
    const router = createRouter();

    router.replace('/deck/demo');

    expect(window.location.hash).toBe('#/deck/demo');
    expect(router.currentPath).toBe('/deck/demo');
  });
});
