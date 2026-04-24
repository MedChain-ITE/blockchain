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
  // REGISTER HOSPITAL
  // ----------------------
    registerHospital(ctx, id, info) {
        const key = "hospital:" + id;
    
        if (ctx.get(key)) throw new Error("Hospital already exists");
    
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
    
        ctx.log("Hospital created: " + id);
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
  const key = "record:" + id + ":" + recordId;

  // Prevent duplicate record
  if (ctx.get(key)) throw new Error("Record exists");

  ctx.set(key, {
    recordId,
    patientId: id,
    data,
    createdBy: ctx.sender,
    timestamp: ctx.timestamp
  });

  // Optional: update patient history if exists
  const patientKey = "patient:" + id;
  const patient = ctx.get(patientKey);

  if (patient) {
    patient.history = patient.history || [];

    patient.history.push({
      action: "add_record",
      recordId,
      by: ctx.sender,
      timestamp: ctx.timestamp
    });

    ctx.set(patientKey, patient);
  }
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