// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/taxInvoiceDraft.model.js
// - web/backend/controllers/credits/creditBPlan.controller.js
// - web/backend/services/practiceLabInvoice.service.js
// - web/backend/controllers/admin/adminSettlementBatch.controller.js

/**
 * BusinessAnchor(+ 대표 연락 담당 User)로부터 (세금)계산서 buyer/seller 스냅샷을 만든다.
 * TaxInvoiceDraft.buyer / TaxInvoiceDraft.seller 서브도큐먼트와 동일 shape.
 */
export function buildPartySnapshotFromAnchor(anchor, contactUser = null) {
  const metadata = anchor?.metadata || {};
  return {
    bizNo: String(
      anchor?.businessNumberNormalized || metadata.businessNumber || "",
    ).replace(/\D/g, ""),
    corpName: metadata.companyName || "",
    ceoName: metadata.representativeName || "",
    addr: [metadata.address, metadata.addressDetail].filter(Boolean).join(" "),
    bizType: metadata.businessType || "",
    bizClass: metadata.businessItem || "",
    contactName: contactUser?.name || "",
    contactEmail: contactUser?.email || metadata.email || "",
    contactTel: contactUser?.phone || metadata.phoneNumber || "",
  };
}
