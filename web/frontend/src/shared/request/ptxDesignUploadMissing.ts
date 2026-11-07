/**
 * PTX 다치아 — 형제 중 일부만 어벗 STL 업로드된 미업로드 건.
 * BE: partnerBilling.ptxDesignUploadMissingVisible + worksheetReadyQueue.guard
 */
export function isPtxDesignStlMissing(request: {
  designCompletedAt?: unknown;
  partnerBilling?: {
    relatedPracticeTransferId?: unknown;
    ptxDesignUploadMissingVisible?: unknown;
  } | null;
  caseInfos?: { hexVerificationSample?: unknown } | null;
} | null | undefined): boolean {
  if (!request) return false;
  if (request.caseInfos?.hexVerificationSample === true) return false;
  if (request.designCompletedAt) return false;
  const relatedPtxId = request.partnerBilling?.relatedPracticeTransferId ?? null;
  if (!relatedPtxId) return false;
  return request.partnerBilling?.ptxDesignUploadMissingVisible === true;
}
