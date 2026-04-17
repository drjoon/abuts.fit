import { connectDb, disconnectDb } from "./_mongo.js";
import SystemSettings from "../../models/systemSettings.model.js";
import { PACK_LABEL_BRANDING_SEED } from "./data/packLabelBranding.seed.js";

async function run() {
  try {
    await connectDb();

    const update = {};
    for (const [k, v] of Object.entries(PACK_LABEL_BRANDING_SEED)) {
      update[`packLabelBranding.${k}`] = v;
    }

    const result = await SystemSettings.findOneAndUpdate(
      { key: "global" },
      { $set: update },
      { new: true, upsert: true, returnDocument: "after" },
    ).lean();

    console.log("[db] seed-branding done", {
      packLabelBranding: result?.packLabelBranding,
    });
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[db] seed-branding failed", err);
  process.exit(1);
});
