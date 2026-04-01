import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.join(__dirname, "../local.env");
console.log("Loading env from:", envPath);
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error("Failed to load .env file:", result.error);
}

const MONGO_URI = process.env.MONGODB_URI_TEST || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error("MONGODB_URI not found in environment variables");
  console.log(
    "Available env vars:",
    Object.keys(process.env).filter((k) => k.includes("MONGO")),
  );
  process.exit(1);
}

console.log(
  "Using MongoDB URI:",
  MONGO_URI.replace(/\/\/.*@/, "//<credentials>@"),
);

async function forceRefreshDashboard() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    const Request = mongoose.model(
      "Request",
      new mongoose.Schema({}, { strict: false }),
      "requests",
    );

    const RequestorDashboardSummarySnapshot = mongoose.model(
      "RequestorDashboardSummarySnapshot",
      new mongoose.Schema({}, { strict: false }),
      "requestordashboardsummarysnapshots",
    );

    const User = mongoose.model(
      "User",
      new mongoose.Schema({}, { strict: false }),
      "users",
    );

    // Find all users to see available emails
    console.log("\nFinding users...");
    const users = await User.find({ role: "requestor" })
      .select({ email: 1, name: 1, businessAnchorId: 1 })
      .limit(10)
      .lean();

    console.log("Available requestor users:");
    users.forEach((u) => {
      console.log(
        `  - ${u.email} (${u.name}) - businessAnchorId: ${u.businessAnchorId}`,
      );
    });

    // Use the first user with businessAnchorId
    const user = users.find((u) => u.businessAnchorId);

    if (!user) {
      console.error("No user with businessAnchorId found");
      process.exit(1);
    }

    console.log("\nUsing user:", user.email);

    console.log("User found:", {
      email: user.email,
      name: user.name,
      businessAnchorId: user.businessAnchorId,
    });

    const businessAnchorId = user.businessAnchorId;

    // Check if request exists
    const requestId = "20260401-LANSPMCS";
    const request = await Request.findOne({ requestId }).lean();

    if (request) {
      console.log(`\n⚠️  Request ${requestId} still exists in DB!`);
      console.log("Request details:", {
        _id: request._id,
        requestId: request.requestId,
        manufacturerStage: request.manufacturerStage,
        businessAnchorId: request.businessAnchorId,
      });

      console.log("\nDeleting request...");
      await Request.deleteOne({ requestId });
      console.log("✅ Request deleted");
    } else {
      console.log(`\n✅ Request ${requestId} already deleted from DB`);
    }

    // Delete all snapshots for this user
    console.log("\nDeleting dashboard snapshots...");
    const deleteResult = await RequestorDashboardSummarySnapshot.deleteMany({
      businessAnchorId: new mongoose.Types.ObjectId(businessAnchorId),
    });
    console.log(`✅ Deleted ${deleteResult.deletedCount} dashboard snapshots`);

    console.log("\n✅ Dashboard cache cleared successfully!");
    console.log("Please refresh the dashboard page to see updated data.");

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

forceRefreshDashboard();
