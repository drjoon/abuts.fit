import AdminSmsLog from "../models/adminSmsLog.model.js";
import {
  sendNotificationViaQueue,
  sendKakaoOrSMSViaQueue,
} from "../utils/notificationQueue.js";
import { listKakaoTemplates } from "../utils/popbill.util.js";

export async function adminSendSms(req, res) {
  try {
    const { to, text } = req.body || {};
    const arr = Array.isArray(to) ? to : typeof to === "string" ? [to] : [];
    const clean = arr
      .map((v) => String(v || "").replace(/[^0-9+]/g, ""))
      .filter((v) => v.length >= 10);

    if (!clean.length || !text) {
      return res
        .status(400)
        .json({ success: false, message: "수신번호/내용을 확인하세요." });
    }

    // 큐에 등록 (SMS/LMS 자동 판단은 sendNotificationViaQueue나 헬퍼에서 처리하거나 여기서 판단)
    // 여기서는 단순히 SMS 타입으로 요청하되, 내용은 notificationQueue가 처리하도록 함
    // 하지만 notificationQueue는 단일 건 처리가 기본일 수 있음.
    // notificationQueue.js를 보면 to가 배열이면 배열로 처리함.

    // SMS 전송 큐잉
    await sendNotificationViaQueue({
      type: text.length > 90 ? "LMS" : "SMS",
      to: clean,
      content: text,
      subject: text.length > 90 ? "관리자 발송" : "",
    });

    await AdminSmsLog.create({
      to: clean,
      text,
      status: "PENDING", // 큐에 넣었으므로 PENDING
      method: text.length > 90 ? "LMS" : "SMS",
      sentBy: req.user?._id,
      note: "Queue registered",
    });

    return res
      .status(200)
      .json({ success: true, message: "전송 요청되었습니다." });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "문자 발송 실패",
      error: error.message,
    });
  }
}

export async function adminListSms(req, res) {
  try {
    const page = Number(req.query.page || 1);
    const limit = Math.min(Number(req.query.limit || 20), 100);
    const skip = (page - 1) * limit;
    const rows = await AdminSmsLog.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const total = await AdminSmsLog.countDocuments({});
    return res.status(200).json({
      success: true,
      data: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "문자 이력 조회 실패",
      error: error.message,
    });
  }
}

export async function adminSendKakaoOrSms(req, res) {
  try {
    const { to, text, templateCode, useKakao = true } = req.body || {};
    const arr = Array.isArray(to) ? to : typeof to === "string" ? [to] : [];
    const clean = arr
      .map((v) => String(v || "").replace(/[^0-9+]/g, ""))
      .filter((v) => v.length >= 10);

    if (!clean.length || !text) {
      return res
        .status(400)
        .json({ success: false, message: "수신번호/내용을 확인하세요." });
    }

    if (useKakao && templateCode) {
      await sendKakaoOrSMSViaQueue({
        to: clean,
        content: text,
        templateCode,
      });
    } else {
      await sendNotificationViaQueue({
        type: text.length > 90 ? "LMS" : "SMS",
        to: clean,
        content: text,
        subject: text.length > 90 ? "알림" : "",
      });
    }

    await AdminSmsLog.create({
      to: clean,
      text,
      status: "PENDING",
      method:
        useKakao && templateCode ? "KAKAO" : text.length > 90 ? "LMS" : "SMS",
      sentBy: req.user?._id,
      note: "Queue registered",
    });

    return res
      .status(200)
      .json({ success: true, message: "전송 요청되었습니다." });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "메시지 발송 실패",
      error: error.message,
    });
  }
}

export async function adminListKakaoTemplates(req, res) {
  try {
    const corpNum = process.env.POPBILL_CORP_NUM || "";
    if (!corpNum) {
      return res.status(500).json({
        success: false,
        message: "POPBILL_CORP_NUM 환경변수가 설정되지 않았습니다.",
      });
    }

    const templates = await listKakaoTemplates(corpNum);

    return res.status(200).json({ success: true, data: templates });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "카카오톡 템플릿 조회 실패",
      error: error.message,
    });
  }
}

export default {
  adminSendSms,
  adminListSms,
  adminSendKakaoOrSms,
  adminListKakaoTemplates,
};
