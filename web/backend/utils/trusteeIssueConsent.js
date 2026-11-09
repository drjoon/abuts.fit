// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/services/practiceObPaymentInvoice.service.js
// - web/backend/controllers/businesses/business.controller.js
//
// trusteeIssueEnabled 기본값은 null이다.
// true/false는 기공소가 저장한 답만 인정한다. updatedAt이 없는 옛 true는 미응답이다.

export function resolveTrusteeIssueEnabled(taxInvoice) {
  if (!taxInvoice?.updatedAt) return null;
  if (taxInvoice.trusteeIssueEnabled === true) return true;
  if (taxInvoice.trusteeIssueEnabled === false) return false;
  return null;
}
