// related files:
// - web/frontend/src/features/chat/components/ChatComposer.tsx
// - web/frontend/src/features/chat/components/ChatMessageBubble.tsx
// - web/frontend/src/shared/practice/openPracticeTransferChat.ts
// change-log:
// - 2026-09-07: # 의뢰건 멘션 토큰(의뢰ID·환자이름) 파싱·표시 SSOT.

/** `[의뢰ID:…]` — 환자이름 포함 가능: `[의뢰ID:PTX-… / 홍길동]` */
export const CASE_MENTION_TOKEN_RE = /\[의뢰ID:([^\]]+)\]/g;

export type CaseMentionParts = {
  requestId: string;
  patientName: string;
};

export const parseCaseMentionInner = (inner: string): CaseMentionParts => {
  const trimmed = String(inner || "").trim();
  if (!trimmed) return { requestId: "", patientName: "" };
  const sep = trimmed.indexOf(" / ");
  if (sep >= 0) {
    return {
      requestId: trimmed.slice(0, sep).trim(),
      patientName: trimmed.slice(sep + 3).trim(),
    };
  }
  return { requestId: trimmed, patientName: "" };
};

export const buildCaseMentionToken = (
  requestId: string,
  patientName?: string,
): string => {
  const id = String(requestId || "").trim();
  const patient = String(patientName || "").trim();
  if (!id) return "";
  if (patient) return `[의뢰ID:${id} / ${patient}]`;
  return `[의뢰ID:${id}]`;
};

/** 버블·목록 공통 라벨: `의뢰ID · 환자이름` */
export const formatCaseMentionLabel = (
  requestId: string,
  patientName?: string,
): string => {
  const id = String(requestId || "").trim();
  const patient = String(patientName || "").trim();
  if (!id) return patient || "";
  if (patient) return `${id} · ${patient}`;
  return id;
};
