// related files:
// - web/backend/services/hometax.service.js
// - web/backend/controllers/businesses/business.update.controller.js

export const HOMETAX_OUTAGE_AFTER_RETRY_MESSAGE =
  "홈택스 장애로 사업자 확인이 지연되고 있습니다. 한 번 더 확인했지만 아직 응답이 없습니다. 복구되면 자동으로 처리됩니다.";

/** 등록증 또는 보류 검증과 사업자번호가 이미 있으면, 다음 단계에서 다시 등록을 요구하지 않는다. */
export function hasSubmittedBusinessRegistration(anchor) {
  if (!anchor) return false;
  const license = anchor.businessLicense || {};
  const hasLicense = Boolean(
    String(license.s3Key || "").trim() || String(license.fileId || "").trim(),
  );
  const deferred = Boolean(anchor.verificationPendingAt);
  const digits = String(
    anchor.businessNumberNormalized || anchor.metadata?.businessNumber || "",
  ).replace(/\D/g, "");
  return digits.length === 10 && (hasLicense || deferred);
}

/**
 * 홈택스 장애(pending)면 조회를 한 번 더 한다.
 * 두 번째도 장애면 retried를 붙여 호출부가 안내 문구를 맞출 수 있게 한다.
 */
export async function verifyBusinessNumberRetryingOutageOnce(verify, args) {
  const first = await verify(args);
  if (!first?.pending) return first;
  const second = await verify(args);
  if (!second?.pending) return second;
  return {
    ...second,
    retried: true,
    message: HOMETAX_OUTAGE_AFTER_RETRY_MESSAGE,
  };
}
