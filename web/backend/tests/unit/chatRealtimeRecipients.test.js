// related files:
// - web/backend/utils/chatRealtimeRecipients.js
import { resolveChatEventRecipientUserIds } from "../../utils/chatRealtimeRecipients.js";

describe("chatRealtimeRecipients", () => {
  test("practice 전송 연결이 없으면 participants만 반환", async () => {
    const ids = await resolveChatEventRecipientUserIds({
      participantIds: ["user-a", "user-b", "user-a"],
      relatedPracticeTransferId: null,
    });
    expect(ids.sort()).toEqual(["user-a", "user-b"]);
  });

  test("유효하지 않은 transfer id면 participants만 반환", async () => {
    const ids = await resolveChatEventRecipientUserIds({
      participantIds: ["user-a"],
      relatedPracticeTransferId: "not-an-object-id",
    });
    expect(ids).toEqual(["user-a"]);
  });
});
