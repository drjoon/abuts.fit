// related files:
// - web/frontend/src/pages/practice/hooks/usePracticeTransferStep1.ts
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - 2026-09-27: 미배정 하청 풀은 치과 실명을 공개. 채팅 가림은 배정 전 openPool·레거시 auto.
// - 2026-08-23: 하청 확정 후에도 치과가 보는 하청 기공소 실명은 비공개(어벗츠만 확인).
export const AUTO_MATCH_IDENTITY_LABEL = "어벗츠기공소";
export const AUTO_MATCH_PRACTICE_LABEL = "자동 매칭";
export const SUBCONTRACT_PRACTICE_LABEL = "비공개";
export const SUBCONTRACT_DIRECT_BLOCKED_MESSAGE =
  "어벗츠기공소를 선택해 주세요.";
export const OWN_ONE_STAR_BLOCKED_MESSAGE =
  "1점을 준 기공소라 의뢰를 보낼 수 없습니다. 검색은 가능합니다.";

export const isAutoMatchModeValue = (mode?: string | null) =>
  String(mode || "").trim() === "auto";

export const isRedactedPracticeDisplayName = (name?: string | null) => {
  const trimmed = String(name || "").trim();
  return (
    trimmed === AUTO_MATCH_PRACTICE_LABEL ||
    trimmed === SUBCONTRACT_PRACTICE_LABEL
  );
};

export const shouldAnonymizeLabViewClinicIdentity = ({
  matchingMode,
  openPool,
  practiceBusinessName,
  viewerIsInternalLab = false,
  viewerIsPerformingLab = false,
  subcontracted = false,
}: {
  matchingMode?: string | null;
  openPool?: boolean;
  practiceBusinessName?: string | null;
  viewerIsInternalLab?: boolean;
  /** 하청을 맡은 기공소. 원청과 같이 치과 채팅명을 본다. */
  viewerIsPerformingLab?: boolean;
  subcontracted?: boolean;
}) => {
  if (viewerIsInternalLab || viewerIsPerformingLab) return false;
  if (Boolean(openPool) || Boolean(subcontracted)) return true;
  return (
    isAutoMatchModeValue(matchingMode) ||
    isRedactedPracticeDisplayName(practiceBusinessName)
  );
};

export const shouldAnonymizePracticeViewLabIdentity = ({
  openPool,
  subcontracted = false,
}: {
  matchingMode?: string | null;
  subcontracted?: boolean;
  openPool?: boolean;
}) => Boolean(openPool) || Boolean(subcontracted);

export const displayAutoMatchCounterpartyName = (
  matchingMode: string | null | undefined,
  name: string,
) =>
  isAutoMatchModeValue(matchingMode)
    ? AUTO_MATCH_IDENTITY_LABEL
    : String(name || "").trim();

export const anonymizeAutoMatchChatSenderName = ({
  matchingMode,
  openPool,
  subcontracted,
  practiceBusinessName,
  viewerIsInternalLab = false,
  viewerIsPerformingLab = false,
  isOwn,
  counterpartLabel,
  name,
}: {
  matchingMode?: string | null;
  openPool?: boolean;
  subcontracted?: boolean;
  practiceBusinessName?: string | null;
  viewerIsInternalLab?: boolean;
  viewerIsPerformingLab?: boolean;
  isOwn: boolean;
  counterpartLabel: string;
  name: string;
}) => {
  if (isOwn) {
    return String(name || "").trim() || counterpartLabel;
  }
  if (
    shouldAnonymizeLabViewClinicIdentity({
      matchingMode,
      openPool,
      practiceBusinessName,
      viewerIsInternalLab,
      viewerIsPerformingLab,
      subcontracted,
    })
  ) {
    return counterpartLabel;
  }
  if (
    shouldAnonymizePracticeViewLabIdentity({
      matchingMode,
      subcontracted,
      openPool,
    })
  ) {
    return counterpartLabel;
  }
  return String(name || "").trim() || counterpartLabel;
};
