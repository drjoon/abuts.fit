import fs from "fs/promises";
import Connection from "../../models/connection.model.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import {
  parseConnectionPrcFileName,
  PRC_CONNECTION_DIR,
} from "../../utils/prcFilenameCatalog.js";

const CONNECTION_CATEGORY = "hanhwa-connection";
const CONNECTION_DIR = PRC_CONNECTION_DIR;
const CONNECTION_FAMILIES = ["Regular", "Mini"];
const CONNECTION_TYPES = ["Hex", "Non-Hex"];

function getRuntimeEnv() {
  const raw = String(process.env.NODE_ENV || "development")
    .trim()
    .toLowerCase();
  if (raw === "production") return "production";
  if (raw === "test") return "test";
  return "local";
}

function buildDerivedConnectionRows(parsedRows) {
  const grouped = new Map();

  for (const row of parsedRows) {
    const key = [row.manufacturer, row.manufacturerKor, row.system].join("|");
    const bucket = grouped.get(key) || {
      manufacturer: row.manufacturer,
      manufacturerKor: row.manufacturerKor,
      system: row.system,
      actualByKey: new Map(),
    };
    bucket.actualByKey.set(`${row.family}|${row.type}`, row);
    grouped.set(key, bucket);
  }

  const rows = [];
  for (const bucket of grouped.values()) {
    for (const family of CONNECTION_FAMILIES) {
      for (const type of CONNECTION_TYPES) {
        const actual = bucket.actualByKey.get(`${family}|${type}`);
        rows.push({
          manufacturer: bucket.manufacturer,
          manufacturerKor: bucket.manufacturerKor,
          system: bucket.system,
          family,
          type,
          category: CONNECTION_CATEGORY,
          fileName:
            actual?.fileName ||
            `${bucket.manufacturer}_${bucket.system}_${family}_${type}`,
          isActive: Boolean(actual),
        });
      }
    }
  }

  return rows;
}

async function readConnectionSeedFromFolder() {
  const entries = await fs.readdir(CONNECTION_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /_Connection\.prc$/i.test(name))
    .sort((a, b) => a.localeCompare(b, "ko"));

  const parsed = [];
  const skipped = [];
  const seen = new Set();

  for (const fileName of files) {
    const parsed = parseConnectionPrcFileName(fileName);
    const row = parsed
      ? {
          manufacturer: parsed.manufacturer,
          manufacturerKor: parsed.manufacturerKor,
          system: parsed.system,
          family: parsed.family,
          type: parsed.type,
          category: CONNECTION_CATEGORY,
          fileName: parsed.fileName,
          isActive: true,
        }
      : null;
    if (!row) {
      skipped.push(fileName);
      continue;
    }

    const key = [row.manufacturer, row.system, row.type, row.category].join(
      "|",
    );
    if (seen.has(key)) {
      skipped.push(fileName);
      continue;
    }
    seen.add(key);
    parsed.push(row);
  }

  return { parsed: buildDerivedConnectionRows(parsed), skipped, files };
}

async function syncProdAddOnly(rows) {
  let inserted = 0;
  let existing = 0;

  for (const row of rows) {
    const found = await Connection.findOne({
      manufacturer: row.manufacturer,
      system: row.system,
      family: row.family,
      type: row.type,
      category: row.category,
    })
      .select({ _id: 1 })
      .lean();

    if (found) {
      existing += 1;
      continue;
    }

    await Connection.create(row);
    inserted += 1;
  }

  return { mode: "add-only", inserted, existing, removed: 0, updated: 0 };
}

async function syncResetAndSeed(rows) {
  const deleteResult = await Connection.deleteMany({
    category: CONNECTION_CATEGORY,
  });

  if (rows.length > 0) {
    await Connection.insertMany(rows, { ordered: true });
  }

  return {
    mode: "reset-and-seed",
    inserted: rows.length,
    existing: 0,
    removed: deleteResult.deletedCount || 0,
    updated: 0,
  };
}

async function run() {
  const runtimeEnv = getRuntimeEnv();
  try {
    console.log("[db] implant-preset sync start", {
      nodeEnv: runtimeEnv,
      ssotDir: CONNECTION_DIR,
    });
    await connectDb();

    const { parsed, skipped, files } = await readConnectionSeedFromFolder();
    if (parsed.length === 0) {
      throw new Error(
        `No parsable connection files found in SSOT folder: ${CONNECTION_DIR}`,
      );
    }

    const result =
      runtimeEnv === "production"
        ? await syncProdAddOnly(parsed)
        : await syncResetAndSeed(parsed);

    console.log("[db] implant-preset sync done", {
      nodeEnv: runtimeEnv,
      ssotDir: CONNECTION_DIR,
      scanned: files.length,
      parsed: parsed.length,
      skipped,
      result,
      rows: parsed.map((row) => ({
        manufacturer: row.manufacturer,
        system: row.system,
        family: row.family,
        type: row.type,
        isActive: row.isActive,
        fileName: row.fileName,
      })),
    });
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[db] implant-preset sync failed", err);
  process.exit(1);
});
