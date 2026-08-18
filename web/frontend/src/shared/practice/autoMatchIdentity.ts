// related files:
// - web/frontend/src/pages/practice/hooks/usePracticeTransferStep1.ts
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
export const AUTO_MATCH_IDENTITY_LABEL = "어벗츠기공소";

export const isAutoMatchModeValue = (mode?: string | null) =>
  String(mode || "").trim() === "auto";

export const displayAutoMatchCounterpartyName = (
  matchingMode: string | null | undefined,
  name: string,
) =>
  isAutoMatchModeValue(matchingMode)
    ? AUTO_MATCH_IDENTITY_LABEL
    : String(name || "").trim();

export const anonymizeAutoMatchChatSenderName = ({
  matchingMode,
  isOwn,
  counterpartLabel,
  name,
}: {
  matchingMode?: string | null;
  isOwn: boolean;
  counterpartLabel: string;
  name: string;
}) => {
  if (!isAutoMatchModeValue(matchingMode) || isOwn) {
    return String(name || "").trim() || counterpartLabel;
  }
  return counterpartLabel;
};
