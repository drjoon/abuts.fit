// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/services/worksheetReadyQueue.guard.js
// - web/backend/services/adminCommBadge.service.js
// - web/backend/models/remoteSupport/remoteSupportSession.model.js
// - web/frontend/src/shared/hooks/useAdminCommBadges.ts
// change-log:
// - 2026-10-22: 메일 배지 = inbound 수신함·스팸함 미읽음(`mailUnreadBadge.service.js`).
// - 2026-09-18: member·finance·tax 액션대기 카운트 추가.
// - 2026-09-06: remoteSupport = 직원 발신 pending 세션 수.
// - 2026-10-14: 의뢰 배지 = 모니터링 ops 준비 큐 필터 SSOT(샘플·불완전가공 제외).
// - 2026-08-26: 의뢰 배지 = 제조사 준비 큐와 동일(PTX 디자인 미완료·레거시 디자인 mode 제외).
import BusinessRegistrationInquiry from "../../models/businessRegistrationInquiry.model.js";
import { countMailUnreadBadge } from "../../services/mailUnreadBadge.service.js";
import Chat from "../../models/chat.model.js";
import ChatRoom from "../../models/chatRoom.model.js";
import RemoteSupportSession from "../../models/remoteSupport/remoteSupportSession.model.js";
import { buildAdminRequestReadyBadgeFilter } from "../../services/worksheetReadyQueue.guard.js";
import {
  countAdminRequestReadyBadge,
  countFinanceChargePending,
  countMemberPending,
  countTaxPending,
} from "../../services/adminCommBadge.service.js";

/**
 * 관리자 소통·액션대기 메뉴 배지 카운트 조회
 * @route GET /api/admin/comm-badges
 *
 * 이벤트 기반으로 실시간 업데이트되며, 이 엔드포인트는 초기 로드 시에만 호출된다.
 * 이후 카운트 변경은 app-event comm:badge-update 소켓 이벤트로 수신한다.
 */
export async function adminGetCommBadges(req, res) {
  try {
    const [
      requestCount,
      inquiryCount,
      mailCount,
      chatCount,
      remoteSupportCount,
      memberCount,
      financeCount,
      taxCount,
    ] = await Promise.all([
      countAdminRequestReadyBadge(),

      // 문의: 처리되지 않은 열린 문의
      BusinessRegistrationInquiry.countDocuments({ status: "open" }),

      countMailUnreadBadge(),

      // 채팅: 관리자가 참여 중인 채팅방의 총 미읽음 메시지 수
      (async () => {
        const adminUserId = req.user._id;
        const rooms = await ChatRoom.find({
          participants: adminUserId,
          isArchived: false,
        })
          .select("_id")
          .lean();
        if (!rooms.length) return 0;
        const roomIds = rooms.map((r) => r._id);
        const result = await Chat.aggregate([
          {
            $match: {
              roomId: { $in: roomIds },
              isDeleted: false,
              sender: { $ne: adminUserId },
              "readBy.userId": { $ne: adminUserId },
            },
          },
          { $count: "total" },
        ]);
        return result[0]?.total ?? 0;
      })(),

      // 원격 지원: 직원 발신·대기 중 세션
      RemoteSupportSession.countDocuments({
        status: "pending",
        initiatedBy: "staff",
      }),

      countMemberPending(),
      countFinanceChargePending(),
      countTaxPending(),
    ]);

    return res.json({
      success: true,
      data: {
        request: requestCount,
        inquiry: inquiryCount,
        mail: mailCount,
        chat: chatCount,
        sms: 0,
        remoteSupport: remoteSupportCount,
        member: memberCount,
        finance: financeCount,
        tax: taxCount,
      },
    });
  } catch (error) {
    console.error("[adminGetCommBadges] error:", error);
    return res
      .status(500)
      .json({ success: false, message: "배지 카운트 조회 실패" });
  }
}
