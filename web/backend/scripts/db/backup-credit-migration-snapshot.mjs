import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import dotenv from "dotenv";

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  const out = {
    outDir: "",
    nodeEnv: "test",
  };
  const outIdx = args.findIndex((a) => a === "--out");
  if (outIdx >= 0 && args[outIdx + 1]) out.outDir = String(args[outIdx + 1]);
  const envIdx = args.findIndex((a) => a === "--env");
  if (envIdx >= 0 && args[envIdx + 1]) out.nodeEnv = String(args[envIdx + 1]);
  return out;
}

async function dumpCollection(db, name, filePath) {
  const coll = db.collection(name);
  const cursor = coll.find({});
  const ws = fs.createWriteStream(filePath, { encoding: "utf8" });
  let count = 0;

  for await (const doc of cursor) {
    ws.write(`${JSON.stringify(doc)}\n`);
    count += 1;
  }

  await new Promise((resolve, reject) => {
    ws.end(() => resolve());
    ws.on("error", reject);
  });

  return count;
}

async function run() {
  const cli = parseArgs(process.argv || []);
  const envFile = String(process.env.ENV_FILE || "web/backend/local.env");
  dotenv.config({ path: envFile });

  const nodeEnv = String(cli.nodeEnv || process.env.NODE_ENV || "test").toLowerCase();
  const uri =
    nodeEnv === "test"
      ? process.env.MONGODB_URI_TEST || process.env.MONGO_URI_TEST || process.env.MONGODB_URI
      : process.env.MONGODB_URI;

  if (!uri) throw new Error("Mongo URI is required");
  if (!cli.outDir) throw new Error("--out is required");

  const outDir = path.resolve(cli.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  try {
    const db = mongoose.connection.db;
    const allNames = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);

    const legacyCreditName = allNames.includes("creditledgers")
      ? "creditledgers"
      : allNames.includes("creditledger")
        ? "creditledger"
        : allNames.includes("CreditLedger")
          ? "CreditLedger"
          : null;

    const targets = [
      legacyCreditName,
      "ledgerjournals",
      "ledgerlines",
      "businesscreditbalances",
      "businessanchors",
      "requests",
      "shippingpackages",
    ].filter(Boolean);

    const manifest = {
      createdAt: new Date().toISOString(),
      nodeEnv,
      dbName: db.databaseName,
      collections: {},
    };

    for (const name of targets) {
      if (!allNames.includes(name)) continue;
      const filePath = path.join(outDir, `${name}.ndjson`);
      const count = await dumpCollection(db, name, filePath);
      manifest.collections[name] = { file: `${name}.ndjson`, count };
      console.log(`[backup] ${name}: ${count}`);
    }

    fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    console.log(`[backup] manifest: ${path.join(outDir, "manifest.json")}`);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error("[backup-credit-migration-snapshot] failed", error?.message || error);
  process.exit(1);
});
