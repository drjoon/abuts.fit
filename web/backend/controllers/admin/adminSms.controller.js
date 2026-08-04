// related files:
// - web/backend/rules.md
// - web/backend/models/adminSmsLog.model.js
// - web/backend/models/adminSmsTemplate.model.js
// - web/backend/modules/admin/admin.routes.js
// - web/frontend/src/pages/admin/support/AdminSmsPage.tsx
import AdminSmsLog from "../../models/adminSmsLog.model.js";
import AdminSmsTemplate from "../../models/adminSmsTemplate.model.js";
import {
  sendNotificationViaQueue,
  sendKakaoOrSMSViaQueue,
} from "../../utils/notificationQueue.js";
import { listKakaoTemplates } from "../../utils/popbill.util.js";

const SMS_TEMPLATE_SEED_VERSION = 2;

/**
 * 팝빌/카카오 알림톡 등록용 기본 템플릿.
 * - 변수: #{변수명}
 * - emphasizeTitle: 강조표기형 등록 시 사용
 * - 실제 알림톡 발송은 팝빌에서 동일 본문으로 승인 후 kakaoTemplateCode 연결 필요
 */
const DEFAULT_SMS_TEMPLATES = [
  {
    code: "ats_request_received",
    name: "의뢰접수안내",
    emphasizeTitle: "의뢰가 접수되었습니다",
    body: `#{치과명}님, 의뢰가 정상 접수되었습니다.

의뢰번호: #{의뢰번호}
접수일시: #{접수일시}

진행 상황은 어벗츠.핏에서 확인하실 수 있습니다.

어벗츠 주식회사`,
  },
  {
    code: "ats_shipping_started",
    name: "배송시작안내",
    emphasizeTitle: "배송이 시작되었습니다",
    body: `#{치과명}님, 제작이 완료되어 배송이 시작되었습니다.

의뢰번호: #{의뢰번호}
택배사: #{택배사}
송장번호: #{송장번호}

어벗츠 주식회사`,
  },
  {
    code: "ats_credit_low",
    name: "크레딧부족안내",
    emphasizeTitle: "크레딧 잔액 부족",
    body: `#{사업자명}님, 크레딧 잔액이 부족하여 일부 기능 이용이 제한될 수 있습니다.

현재 잔액: #{잔액}원

어벗츠.핏에서 충전 후 이용해 주세요.

어벗츠 주식회사`,
  },
  {
    code: "ats_phone_verify",
    name: "휴대폰인증",
    emphasizeTitle: "인증번호 안내",
    body: `[어벗츠] 휴대폰 인증번호는 #{인증번호} 입니다.
유효시간: #{유효시간}분

본인이 요청하지 않은 경우 이 메시지를 무시해 주세요.

어벗츠 주식회사`,
  },
  {
    code: "ats_account_approved",
    name: "가입승인안내",
    emphasizeTitle: "가입이 승인되었습니다",
    body: `#{이름}님, 어벗츠.핏 가입이 승인되었습니다.

로그인 후 서비스를 이용해 주세요.

어벗츠 주식회사`,
  },
  {
    code: "ats_confirm_request",
    name: "확인요청안내",
    emphasizeTitle: "확인이 필요합니다",
    body: `#{이름}님, 확인이 필요한 사항이 있어 안내드립니다.

내용: #{안내내용}

어벗츠.핏 채팅 또는 고객센터로 문의해 주세요.

어벗츠 주식회사`,
  },
];

async function ensureDefaultSmsTemplates() {
  const activeCodes = DEFAULT_SMS_TEMPLATES.map((t) => t.code);

  for (const item of DEFAULT_SMS_TEMPLATES) {
    const existing = await AdminSmsTemplate.findOne({ code: item.code });
    if (!existing) {
      await AdminSmsTemplate.create({
        name: item.name,
        body: item.body,
        emphasizeTitle: item.emphasizeTitle || "",
        code: item.code,
        kakaoTemplateCode: "",
        seedVersion: SMS_TEMPLATE_SEED_VERSION,
        isSystem: true,
        active: true,
      });
      continue;
    }

    if (Number(existing.seedVersion || 0) < SMS_TEMPLATE_SEED_VERSION) {
      existing.name = item.name;
      existing.body = item.body;
      existing.emphasizeTitle = item.emphasizeTitle || "";
      existing.seedVersion = SMS_TEMPLATE_SEED_VERSION;
      existing.isSystem = true;
      existing.active = true;
      await existing.save();
    }
  }

  if (activeCodes.length) {
    await AdminSmsTemplate.updateMany(
      {
        isSystem: true,
        code: { $nin: activeCodes, $gt: "" },
      },
      { $set: { active: false } },
    );
  }
}

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

    await sendNotificationViaQueue({
      type: text.length > 90 ? "LMS" : "SMS",
      to: clean,
      content: text,
      subject: text.length > 90 ? "관리자 발송" : "",
    });

    await AdminSmsLog.create({
      to: clean,
      text,
      status: "PENDING",
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

    const kakaoCode = String(templateCode || "").trim();
    if (useKakao && kakaoCode) {
      await sendKakaoOrSMSViaQueue({
        to: clean,
        content: text,
        templateCode: kakaoCode,
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
        useKakao && kakaoCode ? "KAKAO" : text.length > 90 ? "LMS" : "SMS",
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
    const corpNum = String(process.env.POPBILL_CORP_NUM || "").replace(
      /-/g,
      "",
    );
    if (!corpNum) {
      return res.status(500).json({
        success: false,
        message: "POPBILL_CORP_NUM 환경변수가 설정되지 않았습니다.",
      });
    }

    const templates = await listKakaoTemplates(corpNum);
    const rows = Array.isArray(templates) ? templates : [];

    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    const err = error || {};
    const message =
      err?.message ||
      err?.Message ||
      (typeof err === "string" ? err : "카카오톡 템플릿 조회 실패");
    return res.status(500).json({
      success: false,
      message,
      error: message,
      code: err?.code ?? err?.Code,
    });
  }
}

export async function adminListSmsTemplates(req, res) {
  try {
    await ensureDefaultSmsTemplates();
    const includeInactive = String(req.query.includeInactive || "") === "true";
    const filter = includeInactive ? {} : { active: true };
    const rows = await AdminSmsTemplate.find(filter)
      .sort({ isSystem: -1, name: 1, updatedAt: -1 })
      .lean();
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "문자 템플릿 조회 실패",
      error: error.message,
    });
  }
}

export async function adminCreateSmsTemplate(req, res) {
  try {
    const name = String(req.body?.name || "").trim();
    const body = String(req.body?.body || "").trim();
    const kakaoTemplateCode = String(req.body?.kakaoTemplateCode || "").trim();

    if (!name || !body) {
      return res.status(400).json({
        success: false,
        message: "템플릿 이름과 내용을 입력하세요.",
      });
    }

    const created = await AdminSmsTemplate.create({
      name,
      body,
      kakaoTemplateCode,
      isSystem: false,
      active: true,
      createdBy: req.user?._id,
      updatedBy: req.user?._id,
    });

    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "문자 템플릿 생성 실패",
      error: error.message,
    });
  }
}

export async function adminUpdateSmsTemplate(req, res) {
  try {
    const id = String(req.params?.id || "").trim();
    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "템플릿 ID가 필요합니다." });
    }

    const existing = await AdminSmsTemplate.findById(id);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "템플릿을 찾을 수 없습니다." });
    }

    if (req.body?.name != null) {
      const name = String(req.body.name || "").trim();
      if (!name) {
        return res
          .status(400)
          .json({ success: false, message: "템플릿 이름을 입력하세요." });
      }
      existing.name = name;
    }
    if (req.body?.body != null) {
      const body = String(req.body.body || "").trim();
      if (!body) {
        return res
          .status(400)
          .json({ success: false, message: "템플릿 내용을 입력하세요." });
      }
      existing.body = body;
    }
    if (req.body?.kakaoTemplateCode != null) {
      existing.kakaoTemplateCode = String(
        req.body.kakaoTemplateCode || "",
      ).trim();
    }
    if (req.body?.active != null) {
      existing.active = Boolean(req.body.active);
    }

    existing.updatedBy = req.user?._id || existing.updatedBy;
    await existing.save();

    return res.status(200).json({ success: true, data: existing });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "문자 템플릿 수정 실패",
      error: error.message,
    });
  }
}

export async function adminDeleteSmsTemplate(req, res) {
  try {
    const id = String(req.params?.id || "").trim();
    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "템플릿 ID가 필요합니다." });
    }

    const existing = await AdminSmsTemplate.findById(id);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "템플릿을 찾을 수 없습니다." });
    }

    if (existing.isSystem) {
      return res.status(400).json({
        success: false,
        message: "기본 템플릿은 삭제할 수 없습니다. 비활성화만 가능합니다.",
      });
    }

    await AdminSmsTemplate.deleteOne({ _id: existing._id });
    return res.status(200).json({ success: true, message: "삭제되었습니다." });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "문자 템플릿 삭제 실패",
      error: error.message,
    });
  }
}

export default {
  adminSendSms,
  adminListSms,
  adminSendKakaoOrSms,
  adminListKakaoTemplates,
  adminListSmsTemplates,
  adminCreateSmsTemplate,
  adminUpdateSmsTemplate,
  adminDeleteSmsTemplate,
};
