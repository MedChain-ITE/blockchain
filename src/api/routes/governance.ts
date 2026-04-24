import { Hono } from "hono";
import type { MiniLedgerNode } from "../../node.js";

export function governanceRoutes(node: MiniLedgerNode): Hono {
  const app = new Hono();

  app.get("/proposals", (c) => {
    const proposals = node.getGovernor().listProposals();
    return c.json({ proposals, count: proposals.length });
  });

  app.get("/proposals/:id", (c) => {
    const id = c.req.param("id");
    const proposal = node.getGovernor().getProposal(id);
    if (!proposal) return c.json({ error: "Proposal not found" }, 404);
    return c.json(proposal);
  });

  app.get("/contracts", (c) => {
    const contracts = node.getContractRegistry().listContracts();
    return c.json({ contracts, count: contracts.length });
  });

  return app;
}
