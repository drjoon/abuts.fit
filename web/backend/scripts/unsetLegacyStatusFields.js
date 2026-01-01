import "../bootstrap/env.js";
import mongoose from "mongoose";
import Request from "../models/request.model.js";

async function migrate() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(mongoUri);

  const filter = {
    $or: [{ status1: { $exists: true } }, { status2: { $exists: true } }],
  };

  const found = await Request.countDocuments(filter);
  console.log(`Found ${found} requests with legacy status fields.`);

  if (found > 0) {
    const result = await Request.updateMany(filter, {
      $unset: { status1: "", status2: "" },
    });

    const modified =
      typeof result?.modifiedCount === "number"
        ? result.modifiedCount
        : result?.nModified;

    console.log(`Unset completed. Modified ${modified || 0} requests.`);
  }

  await mongoose.disconnect();
  console.log("Disconnected.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
