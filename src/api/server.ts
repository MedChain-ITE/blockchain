import * as fs from "node:fs";
import * as path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { MiniLedgerNode } from "../node.js";
import { requestLogger } from "./middleware/logging.js";
import { healthRoutes } from "./routes/health.js";
import { blockRoutes } from "./routes/blocks.js";
import { transactionRoutes } from "./routes/transactions.js";
import { stateRoutes } from "./routes/state.js";
import { identityRoutes } from "./routes/identity.js";
import { networkRoutes } from "./routes/network.js";
import { governanceRoutes } from "./routes/governance.js";
import { searchRoutes } from "./routes/search.js";

/** Find the dashboard directory — works from both src/ and dist/. */
function findDashboardDir(): string | null {
  // Try relative to this file (in dist/)
  const candidates = [
    path.resolve(import.meta.dirname ?? ".", "..", "dashboard"),
    path.resolve(import.meta.dirname ?? ".", "..", "..", "dashboard"),
    path.resolve(process.cwd(), "dashboard"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.html"))) return dir;
  }
  return null;
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

export function createApp(node: MiniLedgerNode): Hono {
  const app = new Hono();

  // Global middleware
  if (node.config.api.cors) {
    app.use("*", cors());
  }
  app.use("*", requestLogger());

  // Mount API routes
  app.route("/", healthRoutes(node));
  app.route("/", blockRoutes(node));
  app.route("/", transactionRoutes(node));
  app.route("/", stateRoutes(node));
  app.route("/", identityRoutes(node));
  app.route("/", networkRoutes(node));
  app.route("/", governanceRoutes(node));
  app.route("/", searchRoutes(node));

  // Serve dashboard static files
  const dashboardDir = findDashboardDir();
  if (dashboardDir) {
    // Serve known static assets by extension
    app.get("/dashboard/app.js", (c) => {
      const content = fs.readFileSync(path.join(dashboardDir, "app.js"), "utf-8");
      return c.text(content, 200, { "Content-Type": "application/javascript" });
    });

    app.get("/dashboard/style.css", (c) => {
      const content = fs.readFileSync(path.join(dashboardDir, "style.css"), "utf-8");
      return c.text(content, 200, { "Content-Type": "text/css" });
    });

    // SPA: serve index.html for /dashboard and any nested path
    app.get("/dashboard/*", (c) => {
      const html = fs.readFileSync(path.join(dashboardDir, "index.html"), "utf-8");
      return c.html(html);
    });

    app.get("/dashboard", (c) => {
      const html = fs.readFileSync(path.join(dashboardDir, "index.html"), "utf-8");
      return c.html(html);
    });
  }

  // Root — redirect to dashboard
  app.get("/", (c) => {
    if (dashboardDir) {
      return c.redirect("/dashboard");
    }
    return c.json({
      name: "miniledger",
      version: "0.1.0",
      status: node.isRunning() ? "running" : "stopped",
    });
  });

  return app;
}
