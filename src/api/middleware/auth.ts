import type { MiddlewareHandler } from "hono";

/** Placeholder auth middleware. Will be implemented in M3. */
export function requireAuth(): MiddlewareHandler {
  return async (_c, next) => {
    // M1: No auth required. All requests are allowed.
    await next();
  };
}
