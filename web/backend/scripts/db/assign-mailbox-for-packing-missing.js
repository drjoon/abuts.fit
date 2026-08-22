// related files:
// - web/backend/controllers/requests/mailbox.utils.js
// - web/backend/rules.md
// change-log:
// - 2026-08-22: 작업용 샘플도 우편함 백필 대상에 포함 (정식 의뢰와 동일 SSOT).
//
// 세척.패킹 단계인데 mailboxAddress가 비어 있는 의뢰에
// 동일 businessAnchor 활성 점유 재사용(없으면 신규)으로 메일함을 붙인다.
// 헥스 확인용 무료 샘플·R&D 작업용 샘플도 제외하지 않는다.
//
// Usage:
//   ENV_FILE=local.env ABUTS_DB_FORCE=true node scripts/db/assign-mailbox-for-packing-missing.js
//   ENV_FILE=local.env ABUTS_DB_FORCE=true node scripts/db/assign-mailbox-for-packing-missing.js --apply
//   ... requestIds=20260812-HLCGUZZE,20260812-GJEQRFER
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "./_mongo.js";
import Request from "../../models/request.model.js";
import "../../models/user.model.js";
import "../../models/businessAnchor.model.js";
import "../../models/deliveryInfo.model.js";
import "../../models/mailboxAnchorSlot.model.js";
import { assignMailboxForCleaningPackingEnter } from "../../controllers/requests/mailbox.utils.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    apply: false,
    requestIds: [],
    businessAnchorId: "",
  };

  for (const arg of args) {
    const text = String(arg || "").trim();
    if (!text) continue;
    if (text === "--apply") {
      result.apply = true;
      continue;
    }
    if (text.startsWith("requestIds=")) {
      result.requestIds = text
        .slice("requestIds=".length)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      continue;
    }
    if (text.startsWith("businessAnchorId=")) {
      result.businessAnchorId = text
        .slice("businessAnchorId=".length)
        .trim();
      continue;
    }
  }

  return result;
}

async function run() {
  const { apply, requestIds, businessAnchorId } = parseArgs();
  await connectDb();

  const query = {
    manufacturerStage: "세척.패킹",
    $or: [
      { mailboxAddress: null },
      { mailboxAddress: "" },
      { mailboxAddress: { $exists: false } },
    ],
  };

  if (requestIds.length) {
    query.requestId = { $in: requestIds };
  }
  if (businessAnchorId) {
    if (!mongoose.Types.ObjectId.isValid(businessAnchorId)) {
      throw new Error(`invalid businessAnchorId=${businessAnchorId}`);
    }
    query.businessAnchorId = new mongoose.Types.ObjectId(businessAnchorId);
  }

  const targets = await Request.find(query)
    .populate("requestor", "businessAnchorId")
    .select({
      requestId: 1,
      manufacturerStage: 1,
      mailboxAddress: 1,
      businessAnchorId: 1,
      requestor: 1,
      requestCategory: 1,
      source: 1,
      "caseInfos.clinicName": 1,
      "caseInfos.patientName": 1,
      "lotNumber.value": 1,
    })
    .sort({ requestId: 1 });

  console.log(
    `[assign-mailbox-for-packing-missing] candidates=${targets.length} apply=${apply}`,
  );

  const results = [];
  for (const request of targets) {
    // 작업용 샘플도 정식 의뢰와 같이 우편함 배정 (크레딧만 무기록).
    const requestorOrgId =
      request.businessAnchorId || request.requestor?.businessAnchorId || null;
    const before = String(request.mailboxAddress || "").trim() || null;

    const nextMailboxAddress = await assignMailboxForCleaningPackingEnter({
      request,
      requestorOrgId,
    });

    const row = {
      requestId: request.requestId,
      clinicName: request.caseInfos?.clinicName || null,
      patientName: request.caseInfos?.patientName || null,
      lotNumber: String(request?.lotNumber?.value || "").trim() || null,
      businessAnchorId: String(requestorOrgId || "").trim() || null,
      requestCategory: String(request.requestCategory || "").trim() || null,
      before,
      after: nextMailboxAddress || null,
    };

    if (apply && nextMailboxAddress) {
      await request.save();
      row.applied = true;
    } else {
      row.applied = false;
    }

    results.push(row);
    console.log(row);
  }

  const appliedCount = results.filter((r) => r.applied).length;
  console.log(
    `[assign-mailbox-for-packing-missing] done applied=${appliedCount}/${results.length}`,
  );

  if (!apply) {
    console.log(
      "[DRY RUN] 반영하지 않았습니다. --apply 로 다시 실행하세요.",
    );
  }

  await disconnectDb();
}

run().catch(async (err) => {
  console.error("[assign-mailbox-for-packing-missing] failed", err);
  try {
    await disconnectDb();
  } catch {
    // ignore
  }
  process.exit(1);
});
