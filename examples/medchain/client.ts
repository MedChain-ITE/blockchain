const API = "http://localhost:4441";

async function post(path: string, body: any) {
  const res = await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("🏥 MedChain Demo\n");

  const { MEDCHAIN_CONTRACT } = await import("./contracts.js");

  // ----------------------
  // 1. Deploy
  // ----------------------
  console.log("Deploying MedChain...");
  await post("/tx", {
    type: "contract:deploy",
    payload: {
      kind: "contract:deploy",
      name: "medchain",
      version: "1.0",
      code: MEDCHAIN_CONTRACT,
    },
  });

  await sleep(2000);

  // ----------------------
  // 2. Register Patient
  // ----------------------
  console.log("Registering patient...");
  await post("/tx", {
    type: "contract:invoke",
    payload: {
      kind: "contract:invoke",
      contract: "medchain",
      method: "registerPatient",
      args: [
        "PAT-001",
        {
          name: "La Seavyong",
          age: 23,
          bloodType: "O+",
        },
      ],
    },
  });

  await sleep(2000);

  // ----------------------
  // 3. Grant Access
  // ----------------------
  const doctor = "doctor-0x111";

  console.log("Granting doctor access...");
  await post("/tx", {
    type: "contract:invoke",
    payload: {
      kind: "contract:invoke",
      contract: "medchain",
      method: "grantAccess",
      args: ["PAT-001", doctor],
    },
  });

  await sleep(2000);

  // ----------------------
  // 4. Add Records (like shipment updates)
  // ----------------------
  const records = [
    ["REC-001", { diagnosis: "Fever", treatment: "Paracetamol" }],
    ["REC-002", { diagnosis: "Flu", treatment: "Rest + Water" }],
    ["REC-003", { diagnosis: "Checkup", result: "Normal" }],
  ];

  for (const [id, data] of records) {
    console.log("Adding record:", id);

    await post("/tx", {
      type: "contract:invoke",
      payload: {
        kind: "contract:invoke",
        contract: "medchain",
        method: "addRecord",
        args: ["PAT-001", id, data],
      },
    });

    await sleep(2000);
  }

  // ----------------------
  // 5. Query Patient
  // ----------------------
  console.log("\nQuery patient...");

  const result = await post("/state/query", {
    sql: "SELECT * FROM world_state WHERE key='patient:PAT-001'",
  });

  const patient = JSON.parse(result.results[0].value);

  console.log("\n👤 Patient:", patient.info.name);
  console.log("History:");

  for (const h of patient.history) {
    console.log(" -", h.action);
  }
  console.log("\nDone! Check the dashboard at http://localhost:4441/dashboard");
  console.log("\n✅ Done");
}

main().catch(console.error);