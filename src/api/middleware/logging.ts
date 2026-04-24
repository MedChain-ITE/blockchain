import type { MiddlewareHandler } from "hono";

export function requestLogger(): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    // Only log non-health endpoints to reduce noise
    if (!c.req.path.includes("/health")) {
      console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`);
    }
  };
}
