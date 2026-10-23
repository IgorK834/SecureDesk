// Test helper: finds every Next.js route file below a directory, imports it and lists the HTTP
// method handlers it exports. The route guard tests build on it, so a route added tomorrow is
// covered without anyone remembering to register it.
import { readdirSync } from 'node:fs';
import path from 'node:path';

export const HTTP_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;
export type RouteMethod = (typeof HTTP_METHODS)[number];

export interface ExportedHandler {
  /** The URL path, for example `/api/admin/users` or `/api/tickets/[id]`. */
  route: string;
  method: RouteMethod;
  /** Whatever the module exports under that name; callers check what it really is. */
  handler: unknown;
}

/** The handlers exported by every `route.ts` below `root`, which maps to the URL path `/api`. */
export async function loadRoutes(root: string): Promise<ExportedHandler[]> {
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((file) => path.basename(file) === 'route.ts')
    .sort();

  const handlers: ExportedHandler[] = [];
  for (const file of files) {
    const exports = (await import(/* @vite-ignore */ path.join(root, file))) as Record<
      string,
      unknown
    >;
    const directory = path.dirname(file).split(path.sep).join('/');
    const route = directory === '.' ? '/api' : `/api/${directory}`;
    for (const method of HTTP_METHODS) {
      if (method in exports) handlers.push({ route, method, handler: exports[method] });
    }
  }
  return handlers;
}
