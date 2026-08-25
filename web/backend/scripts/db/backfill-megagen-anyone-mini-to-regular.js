// related files:
// - web/backend/scripts/db/data/connections.seed.js
// - web/frontend/src/shared/practice/cncImplantCatalog.ts
// change-log:
// - 2026-08-26: AnyOne Internal Mini → Regular. 프리셋·주문·전송 PRC/직경 보정.
import "../../bootstrap/env.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import Request from "../../models/request.model.js";
import DraftRequest from "../../models/draftRequest.model.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import BulkShippingSnapshot from "../../models/bulkShippingSnapshot.model.js";
import Connection from "../../models/connection.model.js";

const TARGET_FAMILY = "Regular";
const ANYONE_RH_CONNECTION = "메가젠_AnyOne_RH_Connection.prc";
const ANYONE_RH_FACEHOLE = "메가젠_AnyOne_RH_FaceHole.prc";
const ANYONE_REGULAR_DIAMETER = 3.3;

const norm = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

const isMegagenManufacturer = (manufacturer) => {
  const key = norm(manufacturer);
  return key === "megagen" || key.includes("megagen") || key === "메가젠";
};

/** MiNi Internal 제외 — AnyOne / AnyOne Internal */
const isAnyOneBrand = (brand) => {
  const key = norm(brand);
  if (!key) return false;
  if (key.includes("miniinternal")) return false;
  if (key === "mini") return false;
  return key.includes("anyone");
};

const isMiniFamily = (family) => norm(family) === "mini";

const matchesAnyOneMini = (row) => {
  if (!row || typeof row !== "object") return false;
  const manufacturer = row.implantManufacturer ?? row.manufacturer;
  const brand = row.implantBrand ?? row.brand;
  const family = row.implantFamily ?? row.family;
  return (
    isMegagenManufacturer(manufacturer) &&
    isAnyOneBrand(brand) &&
    isMiniFamily(family)
  );
};

const patchImplantFields = (row, { fixPrc = false } = {}) => {
  if (!matchesAnyOneMini(row)) return false;
  let changed = false;

  if (row.implantFamily != null) {
    if (String(row.implantFamily).trim() !== TARGET_FAMILY) {
      row.implantFamily = TARGET_FAMILY;
      changed = true;
    }
  }
  if (row.family != null) {
    if (String(row.family).trim() !== TARGET_FAMILY) {
      row.family = TARGET_FAMILY;
      changed = true;
    }
  }

  if (fixPrc) {
    const conn = String(row.connectionPrcFileName || "");
    if (conn.includes("AnyOne_MH")) {
      row.connectionPrcFileName = ANYONE_RH_CONNECTION;
      changed = true;
    }
    const face = String(row.faceHolePrcFileName || "");
    if (face.includes("AnyOne_MH")) {
      row.faceHolePrcFileName = ANYONE_RH_FACEHOLE;
      changed = true;
    }
    const diameter = Number(row.connectionDiameter);
    if (Number.isFinite(diameter) && diameter > 0 && diameter < 3.2) {
      row.connectionDiameter = ANYONE_REGULAR_DIAMETER;
      changed = true;
    }
  }

  return changed;
};

const patchToothWorks = (rows, options) => {
  if (!Array.isArray(rows)) return 0;
  let count = 0;
  for (const row of rows) {
    if (patchImplantFields(row, options)) count += 1;
  }
  return count;
};

async function backfillImplantFavorites() {
  const anchors = await BusinessAnchor.find({
    "practiceTransferSettings.implantFavorites": {
      $elemMatch: {
        manufacturer: { $regex: /megagen|메가젠/i },
        family: { $regex: /^mini$/i },
      },
    },
  })
    .select({ _id: 1, practiceTransferSettings: 1 })
    .lean();

  let docs = 0;
  let favorites = 0;

  for (const anchor of anchors) {
    const list = Array.isArray(anchor.practiceTransferSettings?.implantFavorites)
      ? anchor.practiceTransferSettings.implantFavorites.map((row) => ({ ...row }))
      : [];
    let changed = false;
    for (const fav of list) {
      if (patchImplantFields(fav)) {
        favorites += 1;
        changed = true;
      }
    }
    if (!changed) continue;
    await BusinessAnchor.updateOne(
      { _id: anchor._id },
      { $set: { "practiceTransferSettings.implantFavorites": list } },
    );
    docs += 1;
  }

  return { docs, favorites };
}

async function backfillRequests() {
  const cursor = Request.find({
    "caseInfos.implantManufacturer": { $regex: /megagen|메가젠/i },
    "caseInfos.implantBrand": { $regex: /anyone/i },
    "caseInfos.implantFamily": { $regex: /^mini$/i },
  })
    .select({ _id: 1, caseInfos: 1 })
    .cursor();

  let docs = 0;
  for await (const doc of cursor) {
    const caseInfos = doc.caseInfos ? { ...doc.caseInfos } : {};
    const toothWorks = Array.isArray(caseInfos.toothWorks)
      ? caseInfos.toothWorks.map((row) => ({ ...row }))
      : caseInfos.toothWorks;

    const topChanged = patchImplantFields(caseInfos, { fixPrc: true });
    const toothChanged = patchToothWorks(toothWorks, { fixPrc: true });
    if (!topChanged && !toothChanged) continue;

    if (toothWorks) caseInfos.toothWorks = toothWorks;
    await Request.updateOne({ _id: doc._id }, { $set: { caseInfos } });
    docs += 1;
  }

  return { docs };
}

async function backfillDraftRequests() {
  const cursor = DraftRequest.find({
    "caseInfos.implantManufacturer": { $regex: /megagen|메가젠/i },
    "caseInfos.implantBrand": { $regex: /anyone/i },
    "caseInfos.implantFamily": { $regex: /^mini$/i },
  })
    .select({ _id: 1, caseInfos: 1 })
    .cursor();

  let docs = 0;
  for await (const doc of cursor) {
    const caseInfos = doc.caseInfos ? { ...doc.caseInfos } : {};
    const toothWorks = Array.isArray(caseInfos.toothWorks)
      ? caseInfos.toothWorks.map((row) => ({ ...row }))
      : caseInfos.toothWorks;

    const topChanged = patchImplantFields(caseInfos, { fixPrc: true });
    const toothChanged = patchToothWorks(toothWorks, { fixPrc: true });
    if (!topChanged && !toothChanged) continue;

    if (toothWorks) caseInfos.toothWorks = toothWorks;
    await DraftRequest.updateOne({ _id: doc._id }, { $set: { caseInfos } });
    docs += 1;
  }

  return { docs };
}

async function backfillPracticeTransfers() {
  const transfers = await PracticeTransfer.find({
    toothWorks: { $exists: true, $ne: [] },
  })
    .select({ _id: 1, toothWorks: 1 })
    .lean();

  let docs = 0;
  let toothRows = 0;

  for (const transfer of transfers) {
    const toothWorks = Array.isArray(transfer.toothWorks)
      ? transfer.toothWorks.map((row) =>
          row && typeof row === "object" ? { ...row } : row,
        )
      : [];
    const changedRows = patchToothWorks(toothWorks);
    if (!changedRows) continue;
    toothRows += changedRows;
    await PracticeTransfer.updateOne(
      { _id: transfer._id },
      { $set: { toothWorks } },
    );
    docs += 1;
  }

  return { docs, toothRows };
}

async function backfillBulkShippingSnapshots() {
  const result = await BulkShippingSnapshot.updateMany(
    {
      implantManufacturer: { $regex: /megagen|메가젠/i },
      implantBrand: { $regex: /anyone/i },
      implantFamily: { $regex: /^mini$/i },
    },
    { $set: { implantFamily: TARGET_FAMILY } },
  );

  return {
    matched: Number(result.matchedCount || 0),
    modified: Number(result.modifiedCount || 0),
  };
}

async function deactivateAnyOneMiniConnections() {
  const miniResult = await Connection.updateMany(
    {
      manufacturer: "MEGAGEN",
      brand: "AnyOne Internal",
      family: "Mini",
    },
    { $set: { isActive: false } },
  );

  const regularResult = await Connection.updateMany(
    {
      manufacturer: "MEGAGEN",
      brand: "AnyOne Internal",
      family: "Regular",
    },
    {
      $set: {
        isActive: true,
        displayFamily: "Regular (Ø3.5 이상)",
      },
    },
  );

  return {
    mini: {
      matched: Number(miniResult.matchedCount || 0),
      modified: Number(miniResult.modifiedCount || 0),
    },
    regular: {
      matched: Number(regularResult.matchedCount || 0),
      modified: Number(regularResult.modifiedCount || 0),
    },
  };
}

async function run() {
  await connectDb();
  try {
    const favorites = await backfillImplantFavorites();
    const requests = await backfillRequests();
    const drafts = await backfillDraftRequests();
    const transfers = await backfillPracticeTransfers();
    const snapshots = await backfillBulkShippingSnapshots();
    const connections = await deactivateAnyOneMiniConnections();

    console.log("[db] backfill-megagen-anyone-mini-to-regular done", {
      favorites,
      requests,
      drafts,
      transfers,
      snapshots,
      connections,
    });
  } finally {
    await disconnectDb();
  }
}

run().catch((error) => {
  console.error("[db] backfill-megagen-anyone-mini-to-regular failed", error);
  process.exit(1);
});
