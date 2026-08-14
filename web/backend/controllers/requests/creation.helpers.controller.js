// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/modules/requests/request.routes.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/requests/common.requests.controller.js
import { getBusinessCreditBalanceSnapshot } from "../../services/creditBalance.service.js";

// [정책] uploadToRhinoServer / uploadS3ToRhinoServer 제거
// 백엔드가 rhino-server에 직접 STL을 전송하던 방식 삭제.
// rhino-server가 /api/rhino/process-file 호출 시 /bg/original-file → S3에서 직접 다운로드함.

/**
 * STL 파일명을 표준 형식으로 생성하는 헬퍼
 * 형식: {requestId}-{clinicName}-{patientName}-{tooth}{ext}
 */
export function buildStandardStlFileName({
  requestId,
  clinicName,
  patientName,
  tooth,
  originalFileName,
}) {
  const ext = originalFileName?.includes(".")
    ? `.${originalFileName.split(".").pop().toLowerCase()}`
    : ".stl";
  return `${requestId}-${clinicName}-${patientName}-${tooth}${ext}`;
}

export async function getBusinessCreditBalanceBreakdown({
  businessAnchorId,
  session,
}) {
  const snapshot = await getBusinessCreditBalanceSnapshot({
    businessAnchorId,
    session,
    upsertIfMissing: true,
  });

  return {
    balance: Number(snapshot?.balance || 0),
    spendableBalance: Number(
      snapshot?.spendableBalance ??
        Number(snapshot?.balance || 0) + Number(snapshot?.settlementCredit || 0),
    ),
    paidCredit: Number(snapshot?.paidCredit || 0),
    freeRequestCredit: Number(snapshot?.freeRequestCredit || 0),
    freeShippingCredit: Number(snapshot?.freeShippingCredit || 0),
    settlementCredit: Number(snapshot?.settlementCredit || 0),
  };
}

export const isDuplicateKeyError = (err) => {
  const code = err?.code;
  const name = String(err?.name || "");
  const msg = String(err?.message || "");
  return (
    code === 11000 || name === "MongoServerError" || msg.includes("E11000")
  );
};
