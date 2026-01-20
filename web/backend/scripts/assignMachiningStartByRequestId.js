#!/usr/bin/env node
import "../bootstrap/env.js";
import mongoose from "mongoose";
import Request from "../models/request.model.js";

const usage = () => {
  console.log(
    "Usage: node scripts/assignMachiningStartByRequestId.js [--machine M3] <requestId1> <requestId2> ...",
  );
  process.exit(1);
};

const args = process.argv.slice(2);
let machine = "M3";
const requestIds = [];
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === "--machine" || a === "-m") {
    machine = args[i + 1];
    i += 1;
    continue;
  }
  requestIds.push(a);
}

if (!machine) {
  console.error("assignedMachine (--machine) is required");
  usage();
}

if (requestIds.length === 0) usage();

const mongoUri =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  process.env.MONGODB_URI_TEST ||
  process.env.MONGO_URI_TEST;

if (!mongoUri) {
  console.error(
    "[assign] MONGODB_URI(MONGO_URI) is not set (MONGODB_URI_TEST fallback tried). Set it in local.env or export it before running.",
  );
  process.exit(1);
}
const API_BASE = process.env.API_BASE || "http://localhost:3000";
const WEBHOOK_SECRET = process.env.MACHINING_WEBHOOK_SECRET || "";

async function postMachiningStart({ id, assignedMachine }) {
  const res = await fetch(`${API_BASE}/api/webhooks/machining-start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(WEBHOOK_SECRET ? { "x-webhook-secret": WEBHOOK_SECRET } : {}),
    },
    body: JSON.stringify({ id, assignedMachine }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`);
  }

  return res.json();
}

async function main() {
  console.log(`[assign] connecting mongo: ${mongoUri}`);
  await mongoose.connect(mongoUri);

  const docs = await Request.find({ requestId: { $in: requestIds } }).select(
    "_id requestId lotNumber assignedMachine manufacturerStage status",
  );

  if (!docs.length) {
    console.error("No requests found for given requestIds", requestIds);
    process.exit(1);
  }

  console.log(
    "Found:",
    docs.map((d) => ({
      id: String(d._id),
      requestId: d.requestId,
      lotNumber: d.lotNumber || {},
      assignedMachine: d.assignedMachine,
      stage: d.manufacturerStage,
      status: d.status,
    })),
  );

  for (const doc of docs) {
    try {
      console.log(
        `Posting machining-start for ${doc.requestId} (${doc._id}) with machine=${machine}`,
      );
      const resp = await postMachiningStart({
        id: String(doc._id),
        assignedMachine: machine,
      });
      console.log("-> success", resp);
    } catch (err) {
      console.error(
        `-> failed for ${doc.requestId}:`,
        err?.response?.status || err?.code || err?.message,
        err?.response?.data || "",
      );
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
