import mongoose from "mongoose";
import { connectDb, disconnectDb } from "./_mongo.js";
import Request from "../../models/request.model.js";
import "../../models/user.model.js";
import "../../models/businessAnchor.model.js";
import { ensureMailboxAddressForBusiness } from "../../controllers/requests/mailbox.utils.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    requestId: "",
    patientName: "",
    tooth: "",
    clinicNameIncludes: "",
    lotSuffix: "",
    apply: false,
  };

  for (const arg of args) {
    const text = String(arg || "").trim();
    if (!text) continue;
    if (text === "--apply") {
      result.apply = true;
      continue;
    }
    if (text.startsWith("requestId=")) {
      result.requestId = text.slice("requestId=".length).trim();
      continue;
    }
    if (text.startsWith("patientName=")) {
      result.patientName = text.slice("patientName=".length).trim();
      continue;
    }
    if (text.startsWith("tooth=")) {
      result.tooth = text.slice("tooth=".length).trim();
      continue;
    }
    if (text.startsWith("clinicNameIncludes=")) {
      result.clinicNameIncludes = text
        .slice("clinicNameIncludes=".length)
        .trim();
      continue;
    }
    if (text.startsWith("lotSuffix=")) {
      result.lotSuffix = text.slice("lotSuffix=".length).trim();
      continue;
    }
  }

  return result;
}

async function run() {
  const {
    requestId,
    patientName,
    tooth,
    clinicNameIncludes,
    lotSuffix,
    apply,
  } = parseArgs();

  await connectDb();
  console.log("[fix-request-mailbox-anchor-mismatch] connected");

  const filters = [];
  if (requestId) {
    filters.push({ requestId });
  }
  if (patientName) {
    filters.push({
      "caseInfos.patientName": { $regex: patientName, $options: "i" },
    });
  }
  if (tooth) {
    filters.push({ "caseInfos.tooth": { $regex: tooth, $options: "i" } });
  }
  if (clinicNameIncludes) {
    filters.push({
      "caseInfos.clinicName": { $regex: clinicNameIncludes, $options: "i" },
    });
  }
  if (lotSuffix) {
    filters.push({
      "lotNumber.value": { $regex: `${lotSuffix}$`, $options: "i" },
    });
  }

  if (!filters.length) {
    throw new Error(
      "대상 조건이 없습니다. requestId=... 또는 patientName=... tooth=... clinicNameIncludes=... lotSuffix=... 를 지정하세요.",
    );
  }

  const findQuery = filters.length === 1 ? filters[0] : { $and: filters };

  const targets = await Request.find(findQuery)
    .populate("requestor", "business businessAnchorId")
    .populate("businessAnchorId", "name metadata")
    .select({
      requestId: 1,
      lotNumber: 1,
      manufacturerStage: 1,
      mailboxAddress: 1,
      shippingPackageId: 1,
      shippingLabelPrinted: 1,
      businessAnchorId: 1,
      requestor: 1,
      caseInfos: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 });

  if (!targets.length) {
    throw new Error(
      `의뢰를 찾을 수 없습니다. query=${JSON.stringify(findQuery)}`,
    );
  }

  if (targets.length > 1) {
    console.log(
      `[warn] 조건에 맞는 의뢰가 ${targets.length}건입니다. 최신 1건만 처리합니다.`,
    );
    targets.slice(0, 10).forEach((row, idx) => {
      console.log(`  ${idx + 1}.`, {
        requestId: row.requestId,
        lotNumber: String(row?.lotNumber?.value || "").trim() || null,
        stage: row.manufacturerStage,
        mailboxAddress: row.mailboxAddress || null,
        clinicName: row.caseInfos?.clinicName || null,
        patientName: row.caseInfos?.patientName || null,
        tooth: row.caseInfos?.tooth || null,
        createdAt: row.createdAt || null,
      });
    });
  }

  const target = targets[0];

  const requestAnchorIdStr = String(
    target.businessAnchorId?._id || target.businessAnchorId || "",
  ).trim();
  const requestorAnchorIdStr = String(
    target.requestor?.businessAnchorId || "",
  ).trim();
  const canonicalAnchorIdStr = requestorAnchorIdStr || requestAnchorIdStr;

  if (
    !canonicalAnchorIdStr ||
    !mongoose.Types.ObjectId.isValid(canonicalAnchorIdStr)
  ) {
    throw new Error(
      `canonical businessAnchorId를 확인할 수 없습니다. requestAnchor=${requestAnchorIdStr || "-"}, requestorAnchor=${requestorAnchorIdStr || "-"}`,
    );
  }

  const siblingActive = await Request.find({
    _id: { $ne: target._id },
    manufacturerStage: { $in: ["세척.패킹", "포장.발송"] },
    mailboxAddress: { $ne: null },
    businessAnchorId: new mongoose.Types.ObjectId(canonicalAnchorIdStr),
  })
    .select({
      requestId: 1,
      mailboxAddress: 1,
      manufacturerStage: 1,
      createdAt: 1,
    })
    .sort({ createdAt: 1 })
    .lean();

  const nextMailboxAddress = await ensureMailboxAddressForBusiness({
    requestMongoId: target._id,
    requestorOrgId: canonicalAnchorIdStr,
    currentMailboxAddress: target.mailboxAddress,
  });

  const before = {
    requestId: target.requestId,
    stage: target.manufacturerStage,
    clinicName: target.caseInfos?.clinicName || null,
    patientName: target.caseInfos?.patientName || null,
    tooth: target.caseInfos?.tooth || null,
    requestAnchorId: requestAnchorIdStr || null,
    requestorAnchorId: requestorAnchorIdStr || null,
    canonicalAnchorId: canonicalAnchorIdStr,
    mailboxAddress: String(target.mailboxAddress || "").trim() || null,
    nextMailboxAddress,
    shippingPackageId: String(target.shippingPackageId || "").trim() || null,
    shippingLabelPrinted: Boolean(target.shippingLabelPrinted?.printed),
    siblingActiveCount: siblingActive.length,
  };

  console.log("[fix-request-mailbox-anchor-mismatch] preview", before);

  if (!apply) {
    console.log(
      "[DRY RUN] 반영하지 않았습니다. 반영하려면 --apply 옵션으로 다시 실행하세요.",
    );
    return;
  }

  await Request.updateOne(
    { _id: target._id },
    {
      $set: {
        businessAnchorId: new mongoose.Types.ObjectId(canonicalAnchorIdStr),
        mailboxAddress: nextMailboxAddress,
      },
    },
  );

  const updated = await Request.findById(target._id)
    .populate("requestor", "business businessAnchorId")
    .populate("businessAnchorId", "name metadata")
    .select({
      requestId: 1,
      manufacturerStage: 1,
      mailboxAddress: 1,
      businessAnchorId: 1,
      requestor: 1,
      shippingPackageId: 1,
      shippingLabelPrinted: 1,
    })
    .lean();

  console.log("[fix-request-mailbox-anchor-mismatch] updated", {
    requestId: updated?.requestId || null,
    mailboxAddress: String(updated?.mailboxAddress || "").trim() || null,
    businessAnchorId:
      String(
        updated?.businessAnchorId?._id || updated?.businessAnchorId || "",
      ).trim() || null,
    requestorBusinessAnchorId:
      String(updated?.requestor?.businessAnchorId || "").trim() || null,
    shippingPackageId: String(updated?.shippingPackageId || "").trim() || null,
    shippingLabelPrinted: Boolean(updated?.shippingLabelPrinted?.printed),
  });
}

run()
  .catch((error) => {
    console.error("[fix-request-mailbox-anchor-mismatch] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDb().catch(() => {});
  });
