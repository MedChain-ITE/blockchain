import type { MiddlewareHandler } from "hono";
import type { ZodSchema } from "zod";

/** Validate request JSON body against a Zod schema. */
export function validateBody(schema: ZodSchema): MiddlewareHandler {
  return async (c, next) => {
    try {
      const body = await c.req.json();
      const result = schema.safeParse(body);
      if (!result.success) {
        return c.json({ error: "Validation failed", details: result.error.issues }, 400);
      }
      c.set("validatedBody", result.data);
      await next();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
  };
}
