import ManufacturerPayment from "../models/manufacturerPayment.model.js";
import {
  getBankAccountTransactions,
  requestBankAccountList,
} from "../utils/popbill.util.js";
import { sendKakaoATS, sendSMS, sendLMS } from "../utils/popbill.util.js";
import User from "../models/user.model.js";

export async function requestManufacturerBankTransactions(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId || req.user?.role !== "manufacturer") {
      return res.status(403).json({
        success: false,
        message: "제조사 권한이 필요합니다.",
      });
    }

    const { bankCode, accountNumber, startDate, endDate } = req.body;

    if (!bankCode || !accountNumber || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "은행코드, 계좌번호, 조회 시작일, 종료일이 필요합니다.",
      });
    }

    const corpNum = process.env.POPBILL_CORP_NUM || "";
    if (!corpNum) {
      return res.status(500).json({
        success: false,
        message: "팝빌 설정이 누락되었습니다.",
      });
    }

    const result = await requestBankAccountList(
      corpNum,
      bankCode,
      accountNumber,
      startDate,
      endDate
    );

    return res.status(200).json({
      success: true,
      data: result,
      message: "계좌 거래내역 수집 요청이 완료되었습니다.",
    });
  } catch (error) {
    console.error("계좌 거래내역 수집 요청 실패:", error);
    return res.status(500).json({
      success: false,
      message: "계좌 거래내역 수집 요청에 실패했습니다.",
      error: error.message,
    });
  }
}

export async function getManufacturerBankTransactions(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId || req.user?.role !== "manufacturer") {
      return res.status(403).json({
        success: false,
        message: "제조사 권한이 필요합니다.",
      });
    }

    const { bankCode, accountNumber, startDate, endDate } = req.query;

    if (!bankCode || !accountNumber || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "은행코드, 계좌번호, 조회 시작일, 종료일이 필요합니다.",
      });
    }

    const corpNum = process.env.POPBILL_CORP_NUM || "";
    if (!corpNum) {
      return res.status(500).json({
        success: false,
        message: "팝빌 설정이 누락되었습니다.",
      });
    }

    const result = await getBankAccountTransactions(
      corpNum,
      bankCode,
      accountNumber,
      startDate,
      endDate
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("계좌 거래내역 조회 실패:", error);
    return res.status(500).json({
      success: false,
      message: "계좌 거래내역 조회에 실패했습니다.",
      error: error.message,
    });
  }
}

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

    const corpNum = process.env.POPBILL_CORP_NUM || "";
    const senderNum = process.env.POPBILL_SENDER_NUM || "";

    let sent = null;
    let method = "SMS";

    const receivers = [{ rcv: cleanedPhone, rcvnm: "" }];

    if (useKakao && templateCode) {
      try {
        const altContent =
          message.length > 90 ? message.substring(0, 2000) : message;
        const altSendType = message.length > 90 ? "LMS" : "SMS";

        sent = await sendKakaoATS(
          corpNum,
          templateCode,
          senderNum,
          message,
          altContent,
          altSendType,
          receivers,
          "",
          false
        );
        method = "KAKAO";
      } catch (kakaoError) {
        console.warn("카카오톡 전송 실패, SMS로 대체:", kakaoError.message);

        if (message.length > 90) {
          sent = await sendLMS(
            corpNum,
            senderNum,
            "긴급 알림",
            message,
            receivers,
            "",
            false
          );
          method = "LMS";
        } else {
          sent = await sendSMS(
            corpNum,
            senderNum,
            message,
            receivers,
            "",
            false
          );
          method = "SMS";
        }
      }
    } else {
      if (message.length > 90) {
        sent = await sendLMS(
          corpNum,
          senderNum,
          "긴급 알림",
          message,
          receivers,
          "",
          false
        );
        method = "LMS";
      } else {
        sent = await sendSMS(corpNum, senderNum, message, receivers, "", false);
        method = "SMS";
      }
    }

    return res.status(200).json({
      success: true,
      data: sent,
      method,
      message: "긴급 메시지가 발송되었습니다.",
    });
  } catch (error) {
    console.error("긴급 메시지 발송 실패:", error);
    return res.status(500).json({
      success: false,
      message: "긴급 메시지 발송에 실패했습니다.",
      error: error.message,
    });
  }
}

export default {
  requestManufacturerBankTransactions,
  getManufacturerBankTransactions,
  recordManufacturerPayment,
  listManufacturerPayments,
  sendUrgentMessage,
};
