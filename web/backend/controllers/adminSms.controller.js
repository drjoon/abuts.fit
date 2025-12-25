import { SolapiMessageService } from "solapi";
import AdminSmsLog from "../models/adminSmsLog.model.js";

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

    const apiKey = String(process.env.SOLAPI_API_KEY || "").trim();
    const apiSecret = String(process.env.SOLAPI_API_SECRET || "").trim();
    const from = String(process.env.SOLAPI_FROM || "").trim();
    const hasCreds = apiKey && apiSecret && from;
    const isProd = process.env.NODE_ENV === "production";

    const messageService = hasCreds
      ? new SolapiMessageService(apiKey, apiSecret)
      : null;

    // Solapi sendManyDetail 형식
    const messages = clean.map((dest) => ({
      to: dest.startsWith("+") ? dest.replace(/^\+82/, "0") : dest,
      from,
      text,
    }));

    let sent = null;
    try {
      if (messageService) {
        sent = await messageService.sendManyDetail({ messages });
      } else {
        // Dev 환경에서 자격증명 없으면 모의 발송 처리
        if (isProd) {
          return res.status(500).json({
            success: false,
            message: "문자 발송 설정이 누락되었습니다.(SOLAPI_* env)",
          });
        }
        sent = {
          mock: true,
          messages,
          message: "DEV 모드: SOLAPI_* 미설정, 모의 발송 처리",
        };
      }

      await AdminSmsLog.create({
        to: clean,
        text,
        status: "SENT",
        messageId: sent?.groupId || sent?.messageId,
        sentBy: req.user?._id,
      });
    } catch (err) {
      await AdminSmsLog.create({
        to: clean,
        text,
        status: "FAILED",
        errorMessage: err?.message,
        sentBy: req.user?._id,
      });
      throw err;
    }

    return res.status(200).json({ success: true, data: sent });
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

export default { adminSendSms, adminListSms };
