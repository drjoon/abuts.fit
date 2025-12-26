import { SolapiMessageService } from "solapi";
import AdminSmsLog from "../models/adminSmsLog.model.js";
import {
  sendKakaoATS,
  sendSMS,
  sendLMS,
  listKakaoTemplates,
} from "../utils/popbill.util.js";

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

    const corpNum = process.env.POPBILL_CORP_NUM || "";
    const senderNum = process.env.POPBILL_SENDER_NUM || "";
    const isProd = process.env.NODE_ENV === "production";

    if (!corpNum || !senderNum) {
      if (isProd) {
        return res.status(500).json({
          success: false,
          message:
            "팝빌 설정이 누락되었습니다.(POPBILL_CORP_NUM, POPBILL_SENDER_NUM)",
        });
      }
    }

    let sent = null;
    let method = "SMS";
    let error = null;

    if (useKakao && templateCode) {
      try {
        const receivers = clean.map((dest) => ({
          rcv: dest.startsWith("+") ? dest.replace(/^\+82/, "0") : dest,
          rcvnm: "",
        }));

        const altContent = text.length > 90 ? text.substring(0, 2000) : text;
        const altSendType = text.length > 90 ? "LMS" : "SMS";

        sent = await sendKakaoATS(
          corpNum,
          templateCode,
          senderNum,
          text,
          altContent,
          altSendType,
          receivers,
          "",
          false
        );
        method = "KAKAO";

        await AdminSmsLog.create({
          to: clean,
          text,
          status: "SENT",
          method: "KAKAO",
          messageId: sent?.receiptNum || sent?.receiptnum,
          sentBy: req.user?._id,
        });
      } catch (kakaoError) {
        error = kakaoError;
        console.warn("카카오톡 전송 실패, SMS로 대체:", kakaoError.message);

        try {
          const receivers = clean.map((dest) => ({
            rcv: dest.startsWith("+") ? dest.replace(/^\+82/, "0") : dest,
            rcvnm: "",
          }));

          if (text.length > 90) {
            sent = await sendLMS(
              corpNum,
              senderNum,
              "알림",
              text,
              receivers,
              "",
              false
            );
            method = "LMS";
          } else {
            sent = await sendSMS(
              corpNum,
              senderNum,
              text,
              receivers,
              "",
              false
            );
            method = "SMS";
          }

          await AdminSmsLog.create({
            to: clean,
            text,
            status: "SENT",
            method,
            messageId: sent?.receiptNum || sent?.receiptnum,
            sentBy: req.user?._id,
            note: `카카오톡 실패 후 ${method} 대체 발송`,
          });
        } catch (smsError) {
          await AdminSmsLog.create({
            to: clean,
            text,
            status: "FAILED",
            method: "SMS",
            errorMessage: `카카오톡 실패: ${kakaoError.message}, SMS 실패: ${smsError.message}`,
            sentBy: req.user?._id,
          });
          throw smsError;
        }
      }
    } else {
      const receivers = clean.map((dest) => ({
        rcv: dest.startsWith("+") ? dest.replace(/^\+82/, "0") : dest,
        rcvnm: "",
      }));

      if (text.length > 90) {
        sent = await sendLMS(
          corpNum,
          senderNum,
          "알림",
          text,
          receivers,
          "",
          false
        );
        method = "LMS";
      } else {
        sent = await sendSMS(corpNum, senderNum, text, receivers, "", false);
        method = "SMS";
      }

      await AdminSmsLog.create({
        to: clean,
        text,
        status: "SENT",
        method,
        messageId: sent?.receiptNum || sent?.receiptnum,
        sentBy: req.user?._id,
      });
    }

    return res.status(200).json({ success: true, data: sent, method });
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
