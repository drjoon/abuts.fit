import "./bootstrap/env.js";
import mongoose from "mongoose";

const toBool = (v) =>
  String(v || "")
    .trim()
    .toLowerCase() === "true";

const mongoUri =
  process.env.NODE_ENV === "test"
    ? process.env.MONGODB_URI_TEST || "mongodb://localhost:27017/abutsFitTest"
    : process.env.NODE_ENV === "production"
    ? process.env.MONGODB_URI || "mongodb://localhost:27017/abutsFit"
    : process.env.MONGODB_URI_TEST ||
      process.env.MONGODB_URI ||
      "mongodb://localhost:27017/abutsFit";

const mongoSource =
  process.env.NODE_ENV === "test"
    ? "TEST DB"
    : process.env.NODE_ENV === "production"
    ? process.env.MONGODB_URI
      ? "PROD DB"
      : "LOCAL DB"
    : process.env.MONGODB_URI_TEST
    ? "TEST DB"
    : process.env.MONGODB_URI
    ? "PROD DB"
    : "LOCAL DB";

export const dbReady = mongoose
  .connect(mongoUri)
  .then(async () => {
    if (!toBool(process.env.DEBUG_DB_QUIET)) {
      console.log(`[bg] MongoDB connected: ${mongoSource}`);
      const dbName = mongoUri.split("/").pop()?.split("?")[0] || "unknown";
      console.log(`[bg] DB: ${dbName}`);
    }
  })
  .catch((err) => {
    console.error("[bg] MongoDB connection failed:", err);
    throw err;
  });
