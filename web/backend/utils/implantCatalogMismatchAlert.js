// related files:
// - web/backend/controllers/requests/designHandoff.controller.js
// - web/backend/socket.js
// change-log:
// - 2026-09-04: 임플란트 카탈로그 불일치 시 관리자 실시간 alert + 서버 로그.
import { emitAppEventToRoles } from "../socket.js";

/**
 * 임플란트 스펙이 CNC 카탈로그와 맞지 않아 의뢰를 막았을 때 관리자에게 알린다.
 * 사용자에게는 별도 메시지로 「의뢰 불가」만 안내하고, 여기 payload로 코드 수정 단서를 남긴다.
 */
export function alertAdminImplantCatalogMismatch(details = {}) {
  const payload = {
    at: new Date().toISOString(),
    reason: String(details.reason || "implant_catalog_mismatch").trim(),
    source: String(details.source || "").trim(),
    transferId: String(details.transferId || "").trim() || null,
    requestId: String(details.requestId || "").trim() || null,
    tooth: String(details.tooth || "").trim() || null,
    patientName: String(details.patientName || "").trim() || null,
    clinicName: String(details.clinicName || "").trim() || null,
    labName: String(details.labName || "").trim() || null,
    implant: {
      manufacturer: String(details.implantManufacturer || "").trim() || null,
      brand: String(details.implantBrand || "").trim() || null,
      family: String(details.implantFamily || "").trim() || null,
      type: String(details.implantType || "").trim() || null,
    },
    attempted: details.attempted && typeof details.attempted === "object"
      ? {
          manufacturer: String(details.attempted.implantManufacturer || "").trim() || null,
          brand: String(details.attempted.implantBrand || "").trim() || null,
          family: String(details.attempted.implantFamily || "").trim() || null,
          type: String(details.attempted.implantType || "").trim() || null,
        }
      : null,
    message: String(details.message || "").trim() || null,
    actorUserId: details.actorUserId
      ? String(details.actorUserId).trim()
      : null,
  };

  console.error("[ADMIN_ALERT][implant-catalog-mismatch]", JSON.stringify(payload));

  try {
    emitAppEventToRoles(["admin"], "admin:implant-catalog-mismatch", payload);
  } catch (err) {
    console.error(
      "[ADMIN_ALERT][implant-catalog-mismatch] emit failed",
      err?.message || err,
    );
  }

  return payload;
}
