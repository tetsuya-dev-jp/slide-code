/**
 * Simple Hash Router
 * Supports: /#/ (dashboard), /#/deck/:id (present), /#/deck/:id/edit (editor)
 */

export class Router {
    constructor() {
        this.routes = [];
        this.currentView = null;
        window.addEventListener('hashchange', () => this._resolve());
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

    /** Start the router */
    start() {
        this._resolve();
    }

    /** Navigate to a path */
    navigate(path) {
        window.location.hash = `#${path}`;
    }

    /** Resolve the current hash */
    _resolve() {
        const hash = window.location.hash.slice(1) || '/';

        for (const route of this.routes) {
            const match = hash.match(route.regex);
            if (match) {
                const params = {};
                route.paramNames.forEach((name, i) => {
                    params[name] = match[i + 1];
                });
                route.handler(params);
                return;
            }
        }

        // Fallback: go to dashboard
        this.navigate('/');
    }
}
