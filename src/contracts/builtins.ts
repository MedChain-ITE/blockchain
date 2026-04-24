/**
 * Built-in contract: token transfer.
 *
 * State keys: "balance:<address>" -> number
 */
export const TRANSFER_CONTRACT = `
return {

  // ========================
  // INIT (optional)
  // ========================
  init(ctx) {
    ctx.log("MedChain contract initialized");
  },

  // ========================
  // PATIENT
  // ========================
  registerPatient(ctx, patientId, data) {
    if (!patientId) throw new Error("Patient ID required");

    const key = "patient:" + patientId;
    if (ctx.get(key)) throw new Error("Patient already exists");

    ctx.set(key, {
      ...data,
      owner: ctx.sender,
      createdAt: Date.now()
    });

    ctx.log("Patient registered: " + patientId);
  },

  getPatient(ctx, patientId) {
    return ctx.get("patient:" + patientId);
  },

  // ========================
  // ACCESS CONTROL
  // ========================
  grantAccess(ctx, patientId, doctor) {
    const patient = ctx.get("patient:" + patientId);
    if (!patient) throw new Error("Patient not found");

    if (patient.owner !== ctx.sender)
      throw new Error("Only owner can grant access");

    ctx.set("access:" + patientId + ":" + doctor, true);
    ctx.log("Access granted to " + doctor);
  },

  revokeAccess(ctx, patientId, doctor) {
    const patient = ctx.get("patient:" + patientId);
    if (!patient) throw new Error("Patient not found");

    if (patient.owner !== ctx.sender)
      throw new Error("Only owner can revoke access");

    ctx.del("access:" + patientId + ":" + doctor);
    ctx.log("Access revoked from " + doctor);
  },

  hasAccess(ctx, patientId, address) {
    const patient = ctx.get("patient:" + patientId);
    if (!patient) return false;

    if (patient.owner === address) return true;

    return ctx.get("access:" + patientId + ":" + address) || false;
  },

  // ========================
  // MEDICAL RECORD
  // ========================
  addRecord(ctx, patientId, recordId, data) {
    if (!recordId) throw new Error("Record ID required");

    const patient = ctx.get("patient:" + patientId);
    if (!patient) throw new Error("Patient not found");

    const allowed = this.hasAccess(ctx, patientId, ctx.sender);
    if (!allowed) throw new Error("No access");

    const key = "record:" + patientId + ":" + recordId;
    if (ctx.get(key)) throw new Error("Record already exists");

    ctx.set(key, {
      ...data,
      createdBy: ctx.sender,
      createdAt: Date.now()
    });

    ctx.log("Record added: " + recordId);
  },

  getRecord(ctx, patientId, recordId) {
    const allowed = this.hasAccess(ctx, patientId, ctx.sender);
    if (!allowed) throw new Error("No access");

    return ctx.get("record:" + patientId + ":" + recordId);
  },

  // ========================
  // QUERY HELPERS
  // ========================
  getMyPatients(ctx) {
    return ctx.query("patient:");
  },

  getPatientRecords(ctx, patientId) {
    const allowed = this.hasAccess(ctx, patientId, ctx.sender);
    if (!allowed) throw new Error("No access");

    return ctx.query("record:" + patientId + ":");
  }

}
`;

/**
 * Built-in contract: simple key-value store with ownership.
 */
export const KV_STORE_CONTRACT = `
return {
  set(ctx, key, value) {
    const fullKey = "kv:" + key;
    const existing = ctx.get(fullKey + ":owner");
    if (existing && existing !== ctx.sender) throw new Error("Not owner of key: " + key);
    ctx.set(fullKey, value);
    ctx.set(fullKey + ":owner", ctx.sender);
  },

  get(ctx, key) {
    return ctx.get("kv:" + key);
  },

  del(ctx, key) {
    const owner = ctx.get("kv:" + key + ":owner");
    if (owner && owner !== ctx.sender) throw new Error("Not owner of key: " + key);
    ctx.del("kv:" + key);
    ctx.del("kv:" + key + ":owner");
  }
}
`;
