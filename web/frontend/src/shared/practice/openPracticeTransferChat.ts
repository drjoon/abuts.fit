// related files:
// - web/frontend/src/features/chat/components/NewChatWidget.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// change-log:
// - 2026-09-07: 채팅 의뢰ID 클릭 → 작업현황(채팅) 열기 이벤트.

export const OPEN_PRACTICE_TRANSFER_CHAT_EVENT =
  "abuts:practice-transfer:open" as const;

export type OpenPracticeTransferChatDetail = {
  transferId: string;
  /** 기본 chat = 작업현황 */
  panel?: "chat" | "detail";
};

export const requestOpenPracticeTransferChat = (
  transferId: string,
  options?: { panel?: "chat" | "detail" },
) => {
  const id = String(transferId || "").trim();
  if (!id || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<OpenPracticeTransferChatDetail>(
      OPEN_PRACTICE_TRANSFER_CHAT_EVENT,
      {
        detail: {
          transferId: id,
          panel: options?.panel || "chat",
        },
      },
    ),
  );
};
