// related files:
// - web/backend/services/abutsAdminReferral.service.js
// - web/backend/services/referralOwnershipReset.service.js
// - web/backend/rules.md
/**
 * 소개 코드가 없는 의뢰자: 가입 후 14일간 직접 등록, 이후 어벗츠 관리자 코드(AAA) 영구 귀속.
 * 시계는 가입 시각 + 14일(데모 모드와 같은 ms). 90일 영업 리셋으로 비운 재등록은 이 창과 별개.
 */
export const ABUTS_ADMIN_REFERRAL_CODE = "AAA";
export const REQUESTOR_REFERRAL_SELF_SET_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isReservedReferralCode(code) {
  return (
    String(code || "")
      .trim()
      .toUpperCase() === ABUTS_ADMIN_REFERRAL_CODE
  );
}

export function resolveRequestorSignupAt({ ownerCreatedAt, anchorCreatedAt } = {}) {
  const ownerMs = ownerCreatedAt ? new Date(ownerCreatedAt).getTime() : NaN;
  if (Number.isFinite(ownerMs)) return new Date(ownerMs);
  const anchorMs = anchorCreatedAt ? new Date(anchorCreatedAt).getTime() : NaN;
  if (Number.isFinite(anchorMs)) return new Date(anchorMs);
  return null;
}

export function resolveReferralSelfSetExpiresAt(signupAt) {
  const startedMs = signupAt ? new Date(signupAt).getTime() : NaN;
  if (!Number.isFinite(startedMs)) return null;
  return new Date(startedMs + REQUESTOR_REFERRAL_SELF_SET_DAYS * MS_PER_DAY);
}

/** 가입 시각을 모르면 아직 직접 등록을 막지 않는다. */
export function isWithinReferralSelfSetWindow(signupAt, now = new Date()) {
  const expiresAt = resolveReferralSelfSetExpiresAt(signupAt);
  if (!expiresAt) return true;
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) return true;
  return nowMs < expiresAt.getTime();
}

export function canSelfRegisterReferralCode({
  hasReferrer = false,
  hasPriorDefault = false,
  signupAt = null,
  now = new Date(),
} = {}) {
  if (hasReferrer) return false;
  if (hasPriorDefault) return true;
  return isWithinReferralSelfSetWindow(signupAt, now);
}

export function shouldAssignAbutsAdminReferral({
  hasReferrer = false,
  hasPriorDefault = false,
  signupAt = null,
  now = new Date(),
} = {}) {
  if (hasReferrer || hasPriorDefault) return false;
  const expiresAt = resolveReferralSelfSetExpiresAt(signupAt);
  if (!expiresAt) return false;
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) return false;
  return nowMs >= expiresAt.getTime();
}
