import {Hono} from "hono";
import {z} from "zod";
import type {MiniLedgerNode} from "../../node.js";
import {TxType} from "../../types.js";

export function transactionRoutes(node: MiniLedgerNode): Hono {
    const app = new Hono();

    // ========================
    // BASE TRANSACTION (KEEP)
    // ========================
    app.post("/tx", async (c) => {
        try {
            const body = await c.req.json();

            const tx = await node.submit({
                type: body.type,
                key: body.key,
                value: body.value,
                payload: body.payload,
            });

            return c.json({hash: tx.hash, status: "pending"}, 201);
        } catch (err) {
            return c.json({error: err instanceof Error ? err.message : "Error"}, 400);
        }
    });

    app.get("/tx/recent", async (c) => {
        const page = Math.max(1, Number.parseInt(c.req.query("page") ?? "1", 10) || 1);
        const limit = Math.min(100, Math.max(1, Number.parseInt(c.req.query("limit") ?? "20", 10) || 20));
        const typeFilter = c.req.query("type") ?? "";
        const offset = (page - 1) * limit;
        try {
            let countSql = "SELECT COUNT(*) as total FROM transactions WHERE status = 'confirmed'";
            let dataSql = "SELECT hash, type, sender, nonce, timestamp, payload, signature, block_height, position FROM transactions WHERE status = 'confirmed'";
            const params: unknown[] = [];
            const countParams: unknown[] = [];
            if (typeFilter) {
                countSql += " AND type = ?";
                dataSql += " AND type = ?";
                params.push(typeFilter);
                countParams.push(typeFilter);
            }
            dataSql += " ORDER BY block_height DESC, position DESC LIMIT ? OFFSET ?";
            params.push(limit, offset);
            const db = node.getDatabase().raw();
            const countRow = db.prepare(countSql).get(...countParams) as { total: number };
            const rows = db.prepare(dataSql).all(...params) as {
                hash: string;
                type: string;
                sender: string;
                nonce: number;
                timestamp: number;
                payload: string;
                signature: string;
                block_height: number | null;
                position: number | null;
            }[];
            const transactions = rows.map((r) => ({
                hash: r.hash,
                type: r.type,
                sender: r.sender,
                nonce: r.nonce,
                timestamp: r.timestamp,
                payload: JSON.parse(r.payload),
                signature: r.signature,
                blockHeight: r.block_height,
            }));
            const totalPages = Math.ceil(countRow.total / limit);
            return c.json({transactions, total: countRow.total, page, limit, totalPages});
        } catch (err) {
            const message = err instanceof Error ? err.message : "Query failed";
            return c.json({error: message}, 500);
        }
    });

    app.get("/tx/sender/:pubkey", async (c) => {
        const pubkey = c.req.param("pubkey");
        const transactions = node.getStores().txs.getBySender(pubkey, 200);
        return c.json({transactions, count: transactions.length});
    });
    app.get("/tx/:hash", async (c) => {
        const hash = c.req.param("hash");
        const tx = await node.getTransaction(hash);
        if (!tx) return c.json({error: "Transaction not found"}, 404);
        return c.json(tx);
    });
    app.get("/tx", (c) => {
        const stores = node.getStores();
        const pending = stores.txs.getPending(100);
        return c.json({pending, count: pending.length});
    });


    // ========================
    // MEDCHAIN ROUTES
    // ========================

    // 1. Register Patient
    app.post("/medchain/patient", async (c) => {
        try {
            const body = await c.req.json();
            const db = node.getDatabase().raw();

            // 🔥 CHECK EXIST FIRST
            const exists = db
                .prepare("SELECT 1 FROM world_state WHERE key=?")
                .get("patient:" + body.id);

            if (exists) {
                return c.json({error: "Patient already exists"}, 409);
            }

            const tx = await node.submit({
                type: TxType.ContractInvoke,
                payload: {
                    kind: "contract:invoke",
                    contract: "medchain",
                    method: "registerPatient",
                    args: [body.id, body.info],
                },
            });

            return c.json({hash: tx.hash});
        } catch (err) {
            return c.json({error: err instanceof Error ? err.message : "Error"}, 400);
        }
    });

    // 1. Register Hospital
    app.post("/medchain/hospital", async (c) => {
        try {
            const body = await c.req.json();
            const db = node.getDatabase().raw();

            // 🔥 CHECK EXIST FIRST
            const exists = db
                .prepare("SELECT 1 FROM world_state WHERE key=?")
                .get("hospital:" + body.id);

            if (exists) {
                return c.json({error: "Hospital already exists"}, 409);
            }

            const tx = await node.submit({
                type: TxType.ContractInvoke,
                payload: {
                    kind: "contract:invoke",
                    contract: "medchain",
                    method: "registerHospital",
                    args: [body.id, body.info],
                },
            });

            return c.json({hash: tx.hash});
        } catch (err) {
            return c.json({error: err instanceof Error ? err.message : "Error"}, 400);
        }
    });

    // 2. Grant Access
    app.post("/medchain/access", async (c) => {
        try {
            const body = await c.req.json();

            const tx = await node.submit({
                type: TxType.ContractInvoke,
                payload: {
                    kind: "contract:invoke",
                    contract: "medchain",
                    method: "grantAccess",
                    args: [body.patientId, body.doctor],
                },
            });

            return c.json({hash: tx.hash, action: "grantAccess"});
        } catch (err) {
            return c.json({error: err instanceof Error ? err.message : "Error"}, 400);
        }
    });

    // 3. Add Record
    app.post("/medchain/record", async (c) => {
        try {
            const body = await c.req.json();
            const db = node.getDatabase().raw();

            const key = `record:${body.patientId}:${body.recordId}`;

            // 🔥 CHECK EXIST
            const exists = db
                .prepare("SELECT 1 FROM world_state WHERE key=?")
                .get(key);

            if (exists) {
                return c.json({error: "Record already exists"}, 409);
            }

            const tx = await node.submit({
                type: TxType.ContractInvoke,
                payload: {
                    kind: "contract:invoke",
                    contract: "medchain",
                    method: "addRecord",
                    args: [body.patientId, body.recordId, body.data],
                },
            });

            return c.json({hash: tx.hash});
        } catch (err) {
            return c.json({error: err instanceof Error ? err.message : "Error"}, 400);
        }
    });

    // ========================
    // QUERY MEDCHAIN DATA
    // ========================

    // Get patient
    app.get("/medchain/patient/:id", async (c) => {
        const id = c.req.param("id");

        const db = node.getDatabase().raw();
        const row = db
            .prepare("SELECT value FROM world_state WHERE key=?")
            .get("patient:" + id) as any;

        if (!row) return c.json({error: "Not found"}, 404);

        return c.json(JSON.parse(row.value));
    });

    // Get records
    app.get("/medchain/records/:id", async (c) => {
        const id = c.req.param("id");

        const db = node.getDatabase().raw();
        const rows = db
            .prepare("SELECT key, value FROM world_state WHERE key LIKE ?")
            .all(`record:${id}:%`);

        const records = rows.map((r: any) => ({
            key: r.key,
            data: JSON.parse(r.value),
        }));

        return c.json(records);
    });

    // ========================
    // EXISTING ROUTES (KEEP)
    // ========================

    app.get("/tx/:hash", async (c) => {
        const hash = c.req.param("hash");
        const tx = await node.getTransaction(hash);
        if (!tx) return c.json({error: "Transaction not found"}, 404);
        return c.json(tx);
    });

    app.get("/tx", (c) => {
        const pending = node.getStores().txs.getPending(100);
        return c.json({pending});
    });

    return app;
}