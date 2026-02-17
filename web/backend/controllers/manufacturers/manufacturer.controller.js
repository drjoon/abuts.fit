import ManufacturerPayment from "../../models/manufacturerPayment.model.js";
import { sendNotificationViaQueue } from "../../utils/notificationQueue.js";
import User from "../../models/user.model.js";

export async function recordManufacturerPayment(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId || req.user?.role !== "manufacturer") {
      return res.status(403).json({
        success: false,
        message: "제조사 권한이 필요합니다.",
      });
    }

    const {
      amount,
      occurredAt,
      bankTransactionId,
      externalId,
      printedContent,
      note,
    } = req.body;

    if (!amount || !occurredAt) {
      return res.status(400).json({
        success: false,
        message: "금액과 발생일시가 필요합니다.",
      });
    }

    const payment = await ManufacturerPayment.create({
      userId,
      amount: Number(amount),
      occurredAt: new Date(occurredAt),
      bankTransactionId: bankTransactionId || null,
      externalId: externalId || "",
      printedContent: printedContent || "",
      note: note || "",
      status: "CONFIRMED",
    });

    return res.status(201).json({
      success: true,
      data: payment,
      message: "입금 내역이 기록되었습니다.",
    });
  } catch (error) {
    console.error("입금 내역 기록 실패:", error);
    return res.status(500).json({
      success: false,
      message: "입금 내역 기록에 실패했습니다.",
      error: error.message,
    });
  }
}

export async function listManufacturerPayments(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId || req.user?.role !== "manufacturer") {
      return res.status(403).json({
        success: false,
        message: "제조사 권한이 필요합니다.",
      });
    }

    const { page = 1, limit = 20, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { userId };
    if (status) {
      query.status = status;
    }

    const payments = await ManufacturerPayment.find(query)
      .sort({ occurredAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await ManufacturerPayment.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("입금 내역 조회 실패:", error);
    return res.status(500).json({
      success: false,
      message: "입금 내역 조회에 실패했습니다.",
      error: error.message,
    });
  }
}

export async function sendUrgentMessage(req, res) {
  try {
    const senderId = req.user?._id;
    if (!senderId || req.user?.role !== "manufacturer") {
      return res.status(403).json({
        success: false,
        message: "제조사 권한이 필요합니다.",
      });
    }

    const { targetUserId, message, useKakao = true, templateCode } = req.body;

    if (!targetUserId || !message) {
      return res.status(400).json({
        success: false,
        message: "수신자와 메시지 내용이 필요합니다.",
      });
    }

    const targetUser = await User.findById(targetUserId).select("phone").lean();
    if (!targetUser || !targetUser.phone) {
      return res.status(404).json({
        success: false,
        message: "수신자의 전화번호를 찾을 수 없습니다.",
      });
    }

    const cleanedPhone = targetUser.phone.replace(/[^0-9+]/g, "");
    if (cleanedPhone.length < 10) {
      return res.status(400).json({
        success: false,
        message: "올바른 전화번호가 아닙니다.",
      });
    }

    // 큐를 통한 발송
    const type =
      message.length > 90 ? "LMS" : useKakao && templateCode ? "KAKAO" : "SMS";

    await sendNotificationViaQueue({
      type,
      to: cleanedPhone,
      content: message,
      templateCode: type === "KAKAO" ? templateCode : undefined,
      subject: type === "LMS" ? "긴급 알림" : "",
      priority: 10, // 긴급이므로 우선순위 높임
    });

    return res.status(200).json({
      success: true,
      message: "긴급 메시지가 발송 요청되었습니다.",
    });
  } catch (error) {
    console.error("긴급 메시지 발송 실패:", error);
    return res.status(500).json({
      success: false,
      message: "긴급 메시지 발송 요청에 실패했습니다.",
      error: error.message,
    });
  }
}

export default {
  recordManufacturerPayment,
  listManufacturerPayments,
  sendUrgentMessage,
};
