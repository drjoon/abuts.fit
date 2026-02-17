import "../bootstrap/env.js";
import mongoose from "mongoose";
import Request from "../models/request.model.js";
import { applyStatusMapping } from "../controllers/requests/utils.js";

async function migrate() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(mongoUri);

  const requests = await Request.find({});
  console.log(`Found ${requests.length} requests to migrate.`);

  let updatedCount = 0;
  for (const req of requests) {
    const oldStage = req.manufacturerStage;
    applyStatusMapping(req, req.status);

    if (oldStage !== req.manufacturerStage) {
      await req.save();
      updatedCount++;
    }
  }

  console.log(`Migration completed. Updated ${updatedCount} requests.`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
