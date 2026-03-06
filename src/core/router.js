/**
 * Simple Hash Router
 * Supports: /#/ (dashboard), /#/deck/:id (present), /#/deck/:id/edit (editor)
 */

export class Router {
    constructor() {
        this.routes = [];
        this.currentView = null;
        this.currentPath = window.location.hash.slice(1) || '/';
        this.leaveGuard = null;
        this.errorHandler = null;
        this.pendingPath = null;
        this._handleHashChangeBound = () => {
            void this._handleHashChange();
        };
        window.addEventListener('hashchange', this._handleHashChangeBound);
    }

    /** Register a route pattern with a handler */
    on(pattern, handler) {
        // Convert pattern like '/deck/:id/edit' to regex
        const paramNames = [];
        const regexStr = pattern.replace(/:([^/]+)/g, (_match, name) => {
            paramNames.push(name);
            return '([^/]+)';
        });
        this.routes.push({
            pattern,
            regex: new RegExp(`^${regexStr}$`),
            paramNames,
            handler,
        });
        return this;
    }

    setLeaveGuard(guard) {
        this.leaveGuard = typeof guard === 'function' ? guard : null;
        return this;
    }

    setErrorHandler(handler) {
        this.errorHandler = typeof handler === 'function' ? handler : null;
        return this;
    }

    /** Start the router */
    start() {
        void this._resolve();
    }

    /** Navigate to a path */
    async navigate(path) {
        const nextPath = path || '/';
        const allowed = await this._canLeave(nextPath);
        if (!allowed) {
            this.pendingPath = null;
            this._restoreHash();
            return false;
        }

        this.pendingPath = nextPath;
        window.location.hash = `#${nextPath}`;
        return true;
    }

    replace(path) {
        const nextPath = path || '/';
        window.history.replaceState(window.history.state, '', `#${nextPath}`);
        this.currentPath = nextPath;
    }

    dispose() {
        window.removeEventListener('hashchange', this._handleHashChangeBound);
    }

    /** Resolve the current hash */
    async _handleHashChange() {
        const hash = window.location.hash.slice(1) || '/';
        const shouldSkipGuard = this.pendingPath === hash;
        this.pendingPath = null;

        const allowed = shouldSkipGuard ? true : await this._canLeave(hash);

        if (!allowed) {
            this._restoreHash();
            return;
        }

        await this._resolve(hash);
    }

    async _resolve(hash = window.location.hash.slice(1) || '/') {
        const normalizedHash = hash || '/';

        for (const route of this.routes) {
            const match = normalizedHash.match(route.regex);
            if (match) {
                const params = {};
                route.paramNames.forEach((name, i) => {
                    params[name] = match[i + 1];
                });
                this.currentPath = normalizedHash;
                try {
                    await route.handler(params);
                } catch (err) {
                    if (typeof this.errorHandler === 'function') {
                        this.errorHandler(err, { path: normalizedHash, params, pattern: route.pattern });
                    } else {
                        console.error(err);
                    }
                }
                return;
            }
        }

        // Fallback: go to dashboard
        await this.navigate('/');
    }

    async _canLeave(nextPath) {
        if (typeof this.leaveGuard !== 'function') {
            return true;
        }

        const result = await this.leaveGuard({
            from: this.currentPath,
            to: nextPath,
        });

        return result !== false;
    }

    _restoreHash() {
        window.history.replaceState(window.history.state, '', `#${this.currentPath}`);
    }
}
