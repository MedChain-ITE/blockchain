export const MEDCHAIN_CONTRACT = `
return {

  // ----------------------
  // REGISTER PATIENT
  // ----------------------
    registerPatient(ctx, id, info) {
    const key = "patient:" + id;

    if (ctx.get(key)) throw new Error("Patient already exists");

    ctx.set(key, {
      id,
      info,
      owner: ctx.sender,
      createdAt: ctx.timestamp,
      history: [
        {
          action: "created",
          by: ctx.sender,
          timestamp: ctx.timestamp
        }
      ]
    });

    ctx.log("Patient created: " + id);
  },

  // ----------------------
  // GRANT ACCESS
  // ----------------------
  grantAccess(ctx, id, doctor) {
    const key = "patient:" + id;
    const patient = ctx.get(key);

    if (!patient) throw new Error("Patient not found");
    if (patient.owner !== ctx.sender) throw new Error("Not owner");

    ctx.set("access:" + id + ":" + doctor, true);

    patient.history.push({
      action: "grant_access",
      to: doctor,
      by: ctx.sender,
      timestamp: ctx.timestamp
    });

    ctx.set(key, patient);
  },

  // ----------------------
  // ADD MEDICAL RECORD
  // ----------------------
  addRecord(ctx, id, recordId, data) {
    const patient = ctx.get("patient:" + id);
    if (!patient) throw new Error("Patient not found");

    const isOwner = patient.owner === ctx.sender;
    const hasAccess = ctx.get("access:" + id + ":" + ctx.sender);

    if (!isOwner && !hasAccess)
      throw new Error("No access");

    const key = "record:" + id + ":" + recordId;

    if (ctx.get(key)) throw new Error("Record exists");

    ctx.set(key, {
      recordId,
      patientId: id,
      data,
      createdBy: ctx.sender,
      timestamp: ctx.timestamp
    });

    patient.history.push({
      action: "add_record",
      recordId,
      by: ctx.sender,
      timestamp: ctx.timestamp
    });

    ctx.set("patient:" + id, patient);
  },

  // ----------------------
  // GET PATIENT
  // ----------------------
  getPatient(ctx, id) {
    return ctx.get("patient:" + id);
  },

  // ----------------------
  // GET RECORD
  // ----------------------
  getRecord(ctx, id, recordId) {
    return ctx.get("record:" + id + ":" + recordId);
  }

}
`;