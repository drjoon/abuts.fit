import mongoose from "mongoose";
import "../../bootstrap/env.js";

function redactMongoUri(uri) {
  const s = String(uri || "");
  if (!s) return "";
  return s.replace(/\/\/(.*)@/, "//***@");
}

export function getMongoUri() {
  const nodeEnv = String(process.env.NODE_ENV || "").trim() || "development";
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  const mongoUriTest =
    process.env.MONGODB_URI_TEST || process.env.MONGO_URI_TEST;

  if (nodeEnv === "test") {
    return mongoUriTest || "mongodb://localhost:27017/abutsFitTest";
  }

  if (nodeEnv !== "production" && mongoUriTest) {
    return mongoUriTest;
  }

  return mongoUri || "mongodb://localhost:27017/abutsFit";
}

export function getDbNameFromMongoUri(uri) {
  const raw = String(uri || "");
  if (!raw) return "";
  const withoutQuery = raw.split("?")[0];
  const parts = withoutQuery.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

export function assertSafeToMutateDb(mongoUri) {
  const nodeEnv = String(process.env.NODE_ENV || "").trim() || "development";
  const force = String(process.env.ABUTS_DB_FORCE || "")
    .trim()
    .toLowerCase();
  const isForced = force === "true" || force === "1" || force === "yes";

  const dbName = getDbNameFromMongoUri(mongoUri);
  const isExpectedName = /abuts[_-]?fit/i.test(dbName);

  if (nodeEnv === "production" && !isForced) {
    throw new Error(
      `Refusing to mutate DB in production. Set ABUTS_DB_FORCE=true to override. (db=${
        dbName || "unknown"
      })`
    );
  }

  if (!isExpectedName && !isForced) {
    throw new Error(
      `Refusing to mutate unexpected DB name: ${
        dbName || "unknown"
      }. Set ABUTS_DB_FORCE=true to override.`
    );
  }

  if (nodeEnv !== "production") {
    console.log("[db] target", {
      nodeEnv,
      dbName,
      mongoUri: redactMongoUri(mongoUri),
      forced: isForced,
    });
  }
}

export async function connectDb() {
  const mongoUri = getMongoUri();
  assertSafeToMutateDb(mongoUri);
  await mongoose.connect(mongoUri);
  return { mongoUri };
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

export async function clearAllCollections() {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections || {})) {
    await collections[key].deleteMany({});
  }
}
