import Request from "../../models/request.model.js";
import BusinessRegistrationInquiry from "../../models/businessRegistrationInquiry.model.js";
import Mail from "../../models/mail.model.js";
import Chat from "../../models/chat.model.js";
import ChatRoom from "../../models/chatRoom.model.js";

/**
 * 관리자 소통 메뉴 배지 카운트 조회
 * @route GET /api/admin/comm-badges
 *
 * 이벤트 기반으로 실시간 업데이트되며, 이 엔드포인트는 초기 로드 시에만 호출된다.
 * 이후 카운트 변경은 app-event comm:badge-update 소켓 이벤트로 수신한다.
 */
export async function adminGetCommBadges(req, res) {
  try {
    const [requestCount, inquiryCount, mailCount, chatCount] =
      await Promise.all([
        // 의뢰: 아직 CAM 검토 전인 새 의뢰 (request 단계)
        Request.countDocuments({ manufacturerStage: "request" }),

        // 문의: 처리되지 않은 열린 문의
        BusinessRegistrationInquiry.countDocuments({ status: "open" }),

        // 메일: 수신함의 읽지 않은 메일
        Mail.countDocuments({ folder: "inbox", isRead: false }),

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
      ]);

    return res.json({
      success: true,
      data: {
        request: requestCount,
        inquiry: inquiryCount,
        mail: mailCount,
        chat: chatCount,
        sms: 0,
      },
    });
  } catch (error) {
    console.error("[adminGetCommBadges] error:", error);
    return res
      .status(500)
      .json({ success: false, message: "배지 카운트 조회 실패" });
  }
}
