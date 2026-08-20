// related files:
// - web/frontend/src/pages/practice/hooks/usePracticeTransferStep1.ts
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
export const AUTO_MATCH_IDENTITY_LABEL = "어벗츠기공소";
export const AUTO_MATCH_PRACTICE_LABEL = "자동 매칭";
export const SUBCONTRACT_PRACTICE_LABEL = "비공개";
export const SUBCONTRACT_DIRECT_BLOCKED_MESSAGE =
  "어벗츠기공소를 선택해 주세요.";

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
}: {
  matchingMode?: string | null;
  openPool?: boolean;
  practiceBusinessName?: string | null;
  viewerIsInternalLab?: boolean;
}) => {
  if (viewerIsInternalLab) return false;
  return (
    isAutoMatchModeValue(matchingMode) ||
    Boolean(openPool) ||
    isRedactedPracticeDisplayName(practiceBusinessName)
  );
};

export const shouldAnonymizePracticeViewLabIdentity = ({
  matchingMode,
  subcontracted,
}: {
  matchingMode?: string | null;
  subcontracted?: boolean;
}) => Boolean(subcontracted) && !isAutoMatchModeValue(matchingMode);

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
  isOwn,
  counterpartLabel,
  name,
}: {
  matchingMode?: string | null;
  openPool?: boolean;
  subcontracted?: boolean;
  practiceBusinessName?: string | null;
  viewerIsInternalLab?: boolean;
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
    })
  ) {
    return counterpartLabel;
  }
  if (
    shouldAnonymizePracticeViewLabIdentity({
      matchingMode,
      subcontracted,
    })
  ) {
    return counterpartLabel;
  }
  return String(name || "").trim() || counterpartLabel;
};
