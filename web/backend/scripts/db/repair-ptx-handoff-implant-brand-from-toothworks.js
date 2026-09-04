// related files:
// - web/backend/controllers/requests/designHandoff.controller.js
// - web/backend/services/practiceTransferProduction.service.js
// change-log:
// - 2026-09-04: PTX Request.caseInfos 임플란트가 toothWorks와 어긋난 건을 치식 SSOT로 복구(TS3→US 등).
/**
 * Usage:
 *   cd web/backend && \
 *   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
 *   node scripts/db/repair-ptx-handoff-implant-brand-from-toothworks.js [--apply] [--patient=이길수]
 */
import { connectDb, disconnectDb } from "./_mongo.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import Request from "../../models/request.model.js";
import { normalizeImplantFields } from "../../utils/implantCanonical.js";

const APPLY = process.argv.includes("--apply");
const patientArg = process.argv.find((a) => a.startsWith("--patient="));
const patientFilter = patientArg
  ? String(patientArg.slice("--patient=".length) || "").trim()
  : "";

const pick = (row, ...keys) => {
  for (const key of keys) {
    const v = String(row?.[key] || "").trim();
    if (v) return v;
  }
  return "";
};

const implantFromTooth = (row) => {
  const implantManufacturer = pick(row, "implantManufacturer", "manufacturer");
  const implantBrand = pick(row, "implantBrand", "brand");
  const implantFamily = pick(row, "implantFamily", "family");
  const implantType = pick(row, "implantType", "type");
  if (!implantManufacturer || !implantBrand || !implantFamily || !implantType) {
    return null;
  }
  return normalizeImplantFields({
    implantManufacturer,
    implantBrand,
    implantFamily,
    implantType,
  });
};

const same = (a, b) =>
  String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

async function main() {
  await connectDb();

  const transferQuery = {
    "production.relatedRequestIds.0": { $exists: true },
  };
  if (patientFilter) {
    transferQuery.$or = [
      { "toothWorks.patientName": new RegExp(patientFilter, "i") },
      { transferMemo: new RegExp(patientFilter, "i") },
    ];
  }

  const transfers = await PracticeTransfer.find(transferQuery)
    .select({
      transferId: 1,
      toothWorks: 1,
      "production.relatedRequestIds": 1,
      transferMemo: 1,
    })
    .lean();

  let checked = 0;
  let mismatched = 0;
  let updated = 0;

  for (const transfer of transfers) {
    const ids = (transfer.production?.relatedRequestIds || [])
      .map((id) => String(id || "").trim())
      .filter(Boolean);
    if (ids.length === 0) continue;

    const requests = await Request.find({ _id: { $in: ids } })
      .select({
        requestId: 1,
        "caseInfos.patientName": 1,
        "caseInfos.tooth": 1,
        "caseInfos.implantManufacturer": 1,
        "caseInfos.implantBrand": 1,
        "caseInfos.implantFamily": 1,
        "caseInfos.implantType": 1,
        "caseInfos.hexVerificationSample": 1,
      })
      .lean();

    for (const request of requests) {
      const tooth = String(request?.caseInfos?.tooth || "").trim();
      if (!tooth) continue;
      if (
        patientFilter &&
        !String(request?.caseInfos?.patientName || "").includes(patientFilter)
      ) {
        continue;
      }

      const toothRows = Array.isArray(transfer.toothWorks)
        ? transfer.toothWorks
        : [];
      const row =
        toothRows.find(
          (candidate) =>
            String(candidate?.toothNumber || candidate?.tooth || "").trim() ===
              tooth &&
            (candidate?.customAbutment || candidate?.hasCustomAbutment),
        ) ||
        toothRows.find(
          (candidate) =>
            String(candidate?.toothNumber || candidate?.tooth || "").trim() ===
            tooth,
        );
      const fromTooth = implantFromTooth(row);
      if (!fromTooth) continue;

      checked += 1;
      const ci = request.caseInfos || {};
      const brandMismatch = !same(ci.implantBrand, fromTooth.implantBrand);
      const mfrMismatch = !same(
        ci.implantManufacturer,
        fromTooth.implantManufacturer,
      );
      const familyMismatch = !same(ci.implantFamily, fromTooth.implantFamily);
      const typeMismatch = !same(ci.implantType, fromTooth.implantType);
      if (!brandMismatch && !mfrMismatch && !familyMismatch && !typeMismatch) {
        continue;
      }

      mismatched += 1;
      console.log(
        JSON.stringify(
          {
            transferId: transfer.transferId,
            requestId: request.requestId,
            patient: ci.patientName,
            tooth,
            request: {
              implantManufacturer: ci.implantManufacturer,
              implantBrand: ci.implantBrand,
              implantFamily: ci.implantFamily,
              implantType: ci.implantType,
            },
            toothWorks: fromTooth,
          },
          null,
          2,
        ),
      );

      if (!APPLY) continue;
      await Request.updateOne(
        { _id: request._id },
        {
          $set: {
            "caseInfos.implantManufacturer": fromTooth.implantManufacturer,
            "caseInfos.implantBrand": fromTooth.implantBrand,
            "caseInfos.implantFamily": fromTooth.implantFamily,
            "caseInfos.implantType": fromTooth.implantType,
          },
        },
      );
      updated += 1;
    }
  }

  console.log(
    JSON.stringify(
      { apply: APPLY, checked, mismatched, updated, patientFilter },
      null,
      2,
    ),
  );
  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await disconnectDb();
  } catch {
    // ignore
  }
  process.exit(1);
});
