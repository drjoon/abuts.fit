// related files:
// - web/backend/models/request.model.js
// - web/backend/models/practiceTransfer.model.js
// - web/backend/utils/shippingReceiver.utils.js
// - web/backend/services/practiceTransferProduction.service.js
/**
 * PTX 연동 Request에 practiceBusinessAnchorId 백필.
 * shippingReceiver는 포장.발송 진입 시 live 스냅샷하므로 여기서는 링크만 맞춘다.
 * (선택) --with-receiver 로 현재 BA 주소도 미리 채워 둘 수 있다.
 *
 * Usage:
 *   cd web/backend && \
 *     ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
 *     node scripts/db/backfill-ptx-shipping-receiver.js
 *
 * Dry-run (default). Pass --apply to mutate. Pass --with-receiver to also seed snapshot.
 */
import "../../bootstrap/env.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import Request from "../../models/request.model.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import { buildShippingReceiverFromPractice } from "../../utils/shippingReceiver.utils.js";

const APPLY = process.argv.includes("--apply");
const WITH_RECEIVER = process.argv.includes("--with-receiver");

const needsBackfill = (doc) => {
  const practiceId = String(
    doc?.partnerBilling?.practiceBusinessAnchorId || "",
  ).trim();
  if (!practiceId) return true;
  if (!WITH_RECEIVER) return false;
  const name = String(doc?.shippingReceiver?.name || "").trim();
  const address = String(doc?.shippingReceiver?.address || "").trim();
  return !name || !address;
};

async function main() {
  await connectDb();
  try {
    const candidates = await Request.find({
      "partnerBilling.relatedPracticeTransferId": { $ne: null },
    })
      .select({
        _id: 1,
        requestId: 1,
        partnerBilling: 1,
        shippingReceiver: 1,
        caseInfos: 1,
      })
      .lean();

    const needing = candidates.filter(needsBackfill);
    console.log("[backfill-ptx-shipping-receiver]", {
      totalPtxRequests: candidates.length,
      needingBackfill: needing.length,
      apply: APPLY,
      withReceiver: WITH_RECEIVER,
    });

    if (!needing.length) return;

    const transferIds = [
      ...new Set(
        needing
          .map((r) =>
            String(r?.partnerBilling?.relatedPracticeTransferId || "").trim(),
          )
          .filter(Boolean),
      ),
    ];

    const transfers = await PracticeTransfer.find({
      _id: { $in: transferIds },
    })
      .select({ _id: 1, practiceBusinessAnchorId: 1 })
      .lean();
    const transferById = new Map(
      transfers.map((t) => [String(t._id), t]),
    );

    const practiceIds = [
      ...new Set(
        transfers
          .map((t) => String(t.practiceBusinessAnchorId || "").trim())
          .filter(Boolean),
      ),
    ];

    const anchors = await BusinessAnchor.find({ _id: { $in: practiceIds } })
      .select({ name: 1, metadata: 1 })
      .lean();
    const anchorById = new Map(anchors.map((a) => [String(a._id), a]));

    const users = await User.find({ businessAnchorId: { $in: practiceIds } })
      .select({ businessAnchorId: 1, practiceProfile: 1, updatedAt: 1 })
      .sort({ updatedAt: -1 })
      .lean();
    const userByAnchor = new Map();
    for (const u of users) {
      const key = String(u.businessAnchorId || "").trim();
      if (!key || userByAnchor.has(key)) continue;
      userByAnchor.set(key, u);
    }

    let updated = 0;
    let skipped = 0;

    for (const req of needing) {
      const transferId = String(
        req?.partnerBilling?.relatedPracticeTransferId || "",
      ).trim();
      const transfer = transferById.get(transferId);
      const practiceId = String(
        transfer?.practiceBusinessAnchorId ||
          req?.partnerBilling?.practiceBusinessAnchorId ||
          "",
      ).trim();
      if (!practiceId) {
        skipped += 1;
        continue;
      }

      const practiceAnchor = anchorById.get(practiceId) || null;
      const practiceUser = userByAnchor.get(practiceId) || null;
      const shippingReceiver = WITH_RECEIVER
        ? buildShippingReceiverFromPractice({
            practiceAnchor,
            practiceUser,
          })
        : null;

      if (WITH_RECEIVER && shippingReceiver) {
        if (
          (!shippingReceiver.name || shippingReceiver.name === "치과") &&
          String(req?.caseInfos?.clinicName || "").trim()
        ) {
          shippingReceiver.name = String(req.caseInfos.clinicName).trim();
        }
      }

      console.log(APPLY ? "[apply]" : "[dry-run]", req.requestId, {
        practiceId,
        withReceiver: Boolean(shippingReceiver),
        name: shippingReceiver?.name || practiceAnchor?.name || null,
        hasAddress: Boolean(shippingReceiver?.address),
      });

      if (!APPLY) continue;

      const $set = {
        "partnerBilling.practiceBusinessAnchorId": practiceId,
        "partnerBilling.labDesignedAbutment": true,
      };
      if (shippingReceiver) {
        $set.shippingReceiver = {
          name: shippingReceiver.name,
          phone: shippingReceiver.phone,
          contactName: shippingReceiver.contactName,
          address: shippingReceiver.address,
          addressDetail: shippingReceiver.addressDetail,
          zipCode: shippingReceiver.zipCode,
          sourceAnchorId: shippingReceiver.sourceAnchorId,
        };
      }

      await Request.updateOne({ _id: req._id }, { $set });
      updated += 1;
    }

    console.log("[backfill-ptx-shipping-receiver] done", {
      updated,
      skipped,
      apply: APPLY,
      withReceiver: WITH_RECEIVER,
    });
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
