/*
  The part of Express the route tables in server/src/routes/ use. The demo build aliases `express` to
  this module, so those route tables register their handlers here unchanged and the demo backend
  dispatches browser requests to them.
*/
const compile = path => {
  const names = [];
  const source = path.replace(/:(\w+)/g, (_match, name) => {
    names.push(name);
    return '([^/]+)';
  });
  return { pattern: new RegExp(`^${source}$`), names };
};

export function Router() {
  const routes = [];
  const add = method => (path, ...handlers) => { routes.push({ method, ...compile(path), handlers }); };
  return { routes, get: add('GET'), post: add('POST'), put: add('PUT'), patch: add('PATCH'), delete: add('DELETE') };
}

// The first registered route for this method and path, in registration order as Express matches.
export function matchRoute(routers, method, path) {
  for (const router of routers) {
    for (const route of router.routes) {
      const match = route.method === method && route.pattern.exec(path);
      if (match) return { route, params: Object.fromEntries(route.names.map((name, index) => [name, decodeURIComponent(match[index + 1])])) };
    }
  }
  return null;
}

// A response object with the methods the route tables call.
export function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    type(contentType) { this.headers['Content-Type'] = contentType; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    json(value) { this.headers['Content-Type'] = 'application/json'; this.body = JSON.stringify(value); return this; },
    send(value) { this.body = value; return this; },
    end() { return this; }
  };
}
