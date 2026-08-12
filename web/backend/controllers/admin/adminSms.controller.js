// related files:
// - web/backend/rules.md
// - web/backend/models/adminSmsLog.model.js
// - web/backend/models/adminSmsTemplate.model.js
// - web/backend/modules/admin/admin.routes.js
// - web/frontend/src/pages/admin/support/AdminSmsPage.tsx
// - web/backend/utils/creditBPlanMatching.js
import AdminSmsLog from "../../models/adminSmsLog.model.js";
import AdminSmsTemplate from "../../models/adminSmsTemplate.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import { getBusinessCreditBalanceSnapshot } from "../../services/creditBalance.service.js";
import {
  listKakaoTemplates,
  sendPopbillXMS,
  sendPopbillKakaoATS,
  approxMessageBytes,
} from "../../utils/popbill.util.js";

const SMS_TEMPLATE_SEED_VERSION = 5;

/**
 * 자동 주입 가능 변수 (수신자/사업자 데이터 기준)
 * 프론트 템플릿 편집 UI와 동일 목록을 유지한다.
 */
export const AUTO_SMS_TEMPLATE_VARS = [
  { key: "이름", desc: "사용자명(없으면 사업자명)" },
  { key: "사업자명", desc: "사업자/치과명" },
  { key: "치과명", desc: "사업자/치과명" },
  { key: "대표자명", desc: "사업자 대표자명" },
  { key: "사업자번호", desc: "사업자등록번호" },
  { key: "휴대폰", desc: "수신 휴대폰 번호" },
  { key: "이메일", desc: "사용자 이메일" },
  { key: "역할", desc: "사용자 역할" },
  { key: "잔액", desc: "크레딧 총 잔액(사업자)" },
  { key: "유료잔액", desc: "유료 크레딧 잔액" },
  { key: "무료잔액", desc: "무료 크레딧 잔액" },
  { key: "오늘", desc: "오늘 날짜(KST)" },
  { key: "접수일시", desc: "오늘 일시(KST) — 의뢰 접수 안내용" },
];

/** 직접 입력 필요 변수 */
export const MANUAL_SMS_TEMPLATE_VARS = [
  { key: "의뢰번호", desc: "의뢰 번호" },
  { key: "택배사", desc: "택배사명" },
  { key: "송장번호", desc: "송장 번호" },
  { key: "인증번호", desc: "휴대폰 인증번호" },
  { key: "유효시간", desc: "인증 유효시간(분)" },
  { key: "안내내용", desc: "확인 요청 본문" },
  { key: "입금금액", desc: "기공료 선입금 입금 금액" },
];

/**
 * 환경변수로 기본 알림톡 코드 지정 가능.
 * 예: POPBILL_ATS_ats_credit_low=022070000001
 *     POPBILL_ATS_CREDIT_LOW=022070000001
 */
function envKakaoCodeForTemplate(code) {
  const raw = String(code || "").trim();
  if (!raw) return "";
  const direct = String(process.env[`POPBILL_ATS_${raw}`] || "").trim();
  if (direct) return direct;
  const short = raw.replace(/^ats_/i, "").toUpperCase();
  const alt = String(process.env[`POPBILL_ATS_${short}`] || "").trim();
  return alt;
}

/**
 * 팝빌/카카오 알림톡 등록용 기본 템플릿.
 * - kakaoHints: 팝빌 승인 템플릿명 자동 매칭용 키워드
 * - kakaoTemplateCode: env 또는 팝빌 자동연결로 채움
 */
const DEFAULT_SMS_TEMPLATES = [
  {
    code: "ats_request_received",
    name: "의뢰접수안내",
    emphasizeTitle: "의뢰가 접수되었습니다",
    kakaoHints: ["의뢰접수", "접수안내", "의뢰가 접수"],
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
    kakaoHints: ["배송시작", "배송안내", "배송이 시작"],
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
    kakaoHints: ["크레딧부족", "잔액부족", "크레딧 잔액"],
    body: `#{사업자명}님, 기공료 선입금(크레딧) 잔액이 부족하여 일부 기능 이용이 제한될 수 있습니다.

현재 잔액: #{잔액}원
(유료 #{유료잔액}원 / 무료 #{무료잔액}원)

어벗츠.핏에서 기공료 선입금(크레딧) 충전 후 이용해 주세요.

어벗츠 주식회사`,
  },
  {
    code: "ats_credit_charged",
    name: "기공료선입금반영",
    emphasizeTitle: "기공료 선입금 반영 완료",
    kakaoHints: ["기공료 선입금", "선입금 반영", "크레딧 충전"],
    body: `[어벗츠] 기공료 선입금 반영 완료

#{사업자명}님께서 입금하신 #{입금금액}원이 플랫폼 내 기공료 선입금(크레딧)으로 정상 반영되었습니다.

본 선입금에 대한 면세 계산서는 입금 반영 후 발행됩니다.

어벗츠 주식회사`,
  },
  {
    code: "ats_phone_verify",
    name: "휴대폰인증",
    emphasizeTitle: "인증번호 안내",
    kakaoHints: ["휴대폰인증", "인증번호", "인증 안내"],
    body: `[어벗츠] 휴대폰 인증번호는 #{인증번호} 입니다.
유효시간: #{유효시간}분

본인이 요청하지 않은 경우 이 메시지를 무시해 주세요.

어벗츠 주식회사`,
  },
  {
    code: "ats_account_approved",
    name: "가입승인안내",
    emphasizeTitle: "가입이 승인되었습니다",
    kakaoHints: ["가입승인", "승인안내", "가입이 승인"],
    body: `#{이름}님, 어벗츠.핏 가입이 승인되었습니다.

로그인 후 서비스를 이용해 주세요.

어벗츠 주식회사`,
  },
  {
    code: "ats_confirm_request",
    name: "확인요청안내",
    emphasizeTitle: "확인이 필요합니다",
    kakaoHints: ["확인요청", "확인안내", "확인이 필요"],
    body: `#{이름}님, 확인이 필요한 사항이 있어 안내드립니다.

내용: #{안내내용}

어벗츠.핏 채팅 또는 고객센터로 문의해 주세요.

어벗츠 주식회사`,
  },
];

function scorePopbillMatch(localTpl, popbillTpl) {
  const name = String(popbillTpl?.templateName || "").toLowerCase();
  const content = String(popbillTpl?.template || "").toLowerCase();
  const localName = String(localTpl?.name || "").toLowerCase();
  let score = 0;
  if (name && localName && (name.includes(localName) || localName.includes(name))) {
    score += 100;
  }
  for (const hint of localTpl?.kakaoHints || []) {
    const h = String(hint || "").toLowerCase();
    if (!h) continue;
    if (name.includes(h)) score += 50;
    if (content.includes(h)) score += 10;
  }
  return score;
}

function pickBestPopbillCode(localTpl, popbillRows, usedCodes) {
  let best = null;
  let bestScore = 0;
  for (const row of popbillRows) {
    const code = String(row?.templateCode || "").trim();
    if (!code || usedCodes.has(code)) continue;
    const score = scorePopbillMatch(localTpl, row);
    if (score > bestScore) {
      bestScore = score;
      best = code;
    }
  }
  // 최소 힌트 매칭(50) 이상만 채택
  return bestScore >= 50 ? best : "";
}

async function fetchPopbillAtsRows() {
  const corpNum = String(process.env.POPBILL_CORP_NUM || "").replace(/-/g, "");
  if (!corpNum) return [];
  const templates = await listKakaoTemplates(
    corpNum,
    process.env.POPBILL_USER_ID || null,
  );
  const rows = Array.isArray(templates) ? templates : [];
  return rows
    .map((t) => ({
      templateCode: String(t?.templateCode || "").trim(),
      templateName: String(t?.templateName || t?.templateCode || "").trim(),
      template: String(t?.template || t?.content || ""),
    }))
    .filter((t) => !!t.templateCode);
}

/**
 * 기본/기존 템플릿에 팝빌 알림톡 코드를 채운다.
 * 우선순위: 이미 저장된 코드 > env > 팝빌 이름 자동매칭
 */
async function syncKakaoTemplateCodes({ forceRematch = false } = {}) {
  await ensureDefaultSmsTemplates();
  let popbillRows = [];
  let popbillError = "";
  try {
    popbillRows = await fetchPopbillAtsRows();
  } catch (err) {
    popbillError =
      err?.message || err?.Message || String(err || "팝빌 조회 실패");
  }

  const locals = await AdminSmsTemplate.find({ active: true }).lean();
  const usedCodes = new Set(
    locals
      .map((t) => String(t.kakaoTemplateCode || "").trim())
      .filter(Boolean),
  );

  const updates = [];
  for (const local of locals) {
    const current = String(local.kakaoTemplateCode || "").trim();
    if (current && !forceRematch) continue;

    const seed = DEFAULT_SMS_TEMPLATES.find((d) => d.code === local.code);
    const envCode = envKakaoCodeForTemplate(local.code);
    let next = "";
    if (envCode) {
      next = envCode;
    } else if (seed) {
      next = pickBestPopbillCode(seed, popbillRows, usedCodes);
    } else {
      // 커스텀 템플릿: 이름 기준 매칭
      next = pickBestPopbillCode(
        { name: local.name, kakaoHints: [local.name] },
        popbillRows,
        usedCodes,
      );
    }

    if (!next || next === current) continue;
    usedCodes.add(next);
    await AdminSmsTemplate.updateOne(
      { _id: local._id },
      { $set: { kakaoTemplateCode: next } },
    );
    updates.push({
      id: String(local._id),
      name: local.name,
      code: local.code || "",
      kakaoTemplateCode: next,
      source: envCode === next ? "env" : "popbill-match",
    });
  }

  return {
    updates,
    popbillCount: popbillRows.length,
    popbillError,
    popbillTemplates: popbillRows,
  };
}

async function ensureDefaultSmsTemplates() {
  const activeCodes = DEFAULT_SMS_TEMPLATES.map((t) => t.code);

  for (const item of DEFAULT_SMS_TEMPLATES) {
    const envCode = envKakaoCodeForTemplate(item.code);
    const existing = await AdminSmsTemplate.findOne({ code: item.code });
    if (!existing) {
      await AdminSmsTemplate.create({
        name: item.name,
        body: item.body,
        emphasizeTitle: item.emphasizeTitle || "",
        code: item.code,
        kakaoTemplateCode: envCode || "",
        seedVersion: SMS_TEMPLATE_SEED_VERSION,
        isSystem: true,
        active: true,
      });
      continue;
    }

    const needsSeedUpdate =
      Number(existing.seedVersion || 0) < SMS_TEMPLATE_SEED_VERSION;
    let dirty = false;
    if (needsSeedUpdate) {
      existing.name = item.name;
      existing.body = item.body;
      existing.emphasizeTitle = item.emphasizeTitle || "";
      existing.seedVersion = SMS_TEMPLATE_SEED_VERSION;
      existing.isSystem = true;
      existing.active = true;
      dirty = true;
    }
    // env에 코드가 있고 아직 비어 있으면 채움 (수동 연결 덮어쓰지 않음)
    if (!String(existing.kakaoTemplateCode || "").trim() && envCode) {
      existing.kakaoTemplateCode = envCode;
      dirty = true;
    }
    if (dirty) {
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

function normalizeLocalPhone(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("82") && digits.length >= 11) {
    digits = `0${digits.slice(2)}`;
  }
  return digits;
}

function formatKstDate(d = new Date()) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function formatKstDateTime(d = new Date()) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function formatMoney(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("ko-KR");
}

function formatPhoneDisplay(raw) {
  const digits = normalizeLocalPhone(raw);
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

function normalizeRecipientsPayload(body) {
  const recipients = Array.isArray(body?.recipients) ? body.recipients : null;
  if (recipients?.length) {
    return recipients
      .map((r) => {
        const phone = normalizeLocalPhone(r?.phone || r?.to || "");
        if (phone.length < 10) return null;
        const balanceRaw = r?.balance;
        const paidRaw = r?.paidBalance;
        const freeRaw = r?.freeBalance;
        const businessAnchorId = String(
          r?.businessAnchorId || r?.businessId || "",
        ).trim();
        return {
          phone,
          name: String(r?.name || "").trim(),
          companyName: String(r?.companyName || "").trim(),
          representativeName: String(r?.representativeName || "").trim(),
          businessNumber: String(r?.businessNumber || "").trim(),
          email: String(r?.email || "").trim(),
          role: String(r?.role || "").trim(),
          businessAnchorId,
          balance:
            balanceRaw == null || balanceRaw === ""
              ? null
              : Number(balanceRaw),
          paidBalance:
            paidRaw == null || paidRaw === "" ? null : Number(paidRaw),
          freeBalance:
            freeRaw == null || freeRaw === "" ? null : Number(freeRaw),
        };
      })
      .filter(Boolean);
  }

  const arr = Array.isArray(body?.to)
    ? body.to
    : typeof body?.to === "string"
      ? [body.to]
      : [];
  return arr
    .map((v) => {
      const phone = normalizeLocalPhone(v);
      if (phone.length < 10) return null;
      return {
        phone,
        name: "",
        companyName: "",
        representativeName: "",
        businessNumber: "",
        email: "",
        role: "",
        businessAnchorId: "",
        balance: null,
        paidBalance: null,
        freeBalance: null,
      };
    })
    .filter(Boolean);
}

async function resolveBusinessAnchorIdForRecipient(recipient) {
  if (recipient?.businessAnchorId) return String(recipient.businessAnchorId);

  const phone = normalizeLocalPhone(recipient?.phone || "");
  if (phone.length >= 10) {
    const byPhone = await BusinessAnchor.findOne({
      $or: [
        { "metadata.phoneNumber": phone },
        { "metadata.phoneNumber": formatPhoneDisplay(phone) },
      ],
    })
      .select({ _id: 1 })
      .lean();
    if (byPhone?._id) return String(byPhone._id);
  }

  // 사용자 휴대폰 → businessAnchorId
  if (phone.length >= 10) {
    const user = await User.findOne({
      $or: [{ phoneNumber: phone }, { phoneNumber: `+82${phone.slice(1)}` }],
    })
      .select({ businessAnchorId: 1 })
      .lean();
    if (user?.businessAnchorId) return String(user.businessAnchorId);
  }

  return "";
}

async function enrichRecipientsWithBalances(recipients) {
  const withIds = [];
  for (const r of recipients) {
    const businessAnchorId = await resolveBusinessAnchorIdForRecipient(r);
    withIds.push({ ...r, businessAnchorId });
  }

  const uniqueIds = Array.from(
    new Set(withIds.map((r) => r.businessAnchorId).filter(Boolean)),
  );
  const balanceById = new Map();
  await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const snap = await getBusinessCreditBalanceSnapshot({
          businessAnchorId: id,
          upsertIfMissing: false,
        });
        balanceById.set(id, {
          balance: Number(snap?.balance || 0),
          paidBalance: Number(snap?.paidCredit || 0),
          freeBalance:
            Number(snap?.freeRequestCredit || 0) +
            Number(snap?.freeShippingCredit || 0),
        });
      } catch {
        balanceById.set(id, {
          balance: 0,
          paidBalance: 0,
          freeBalance: 0,
        });
      }
    }),
  );

  return withIds.map((r) => {
    if (!r.businessAnchorId || !balanceById.has(r.businessAnchorId)) {
      return r;
    }
    const b = balanceById.get(r.businessAnchorId);
    return {
      ...r,
      // 서버 GL 잔액을 SSOT로 사용 (프론트 전달값보다 우선)
      balance: b.balance,
      paidBalance: b.paidBalance,
      freeBalance: b.freeBalance,
    };
  });
}

function buildAutoTemplateVars(recipient) {
  const name = String(recipient?.name || "").trim();
  const companyName = String(recipient?.companyName || "").trim();
  const display = name || companyName;
  const today = formatKstDate();
  const todayTime = formatKstDateTime();
  const vars = {
    이름: display,
    치과명: companyName || name,
    사업자명: companyName || name,
    대표자명: String(recipient?.representativeName || "").trim(),
    사업자번호: String(recipient?.businessNumber || "").trim(),
    휴대폰: formatPhoneDisplay(recipient?.phone || ""),
    이메일: String(recipient?.email || "").trim(),
    역할: String(recipient?.role || "").trim(),
    오늘: today,
    접수일시: todayTime,
  };

  // 사업자 앵커가 있으면 잔액 변수는 항상 채움(0 포함)
  if (recipient?.businessAnchorId) {
    vars.잔액 = formatMoney(
      recipient?.balance != null && Number.isFinite(Number(recipient.balance))
        ? recipient.balance
        : 0,
    );
    vars.유료잔액 = formatMoney(
      recipient?.paidBalance != null &&
        Number.isFinite(Number(recipient.paidBalance))
        ? recipient.paidBalance
        : 0,
    );
    vars.무료잔액 = formatMoney(
      recipient?.freeBalance != null &&
        Number.isFinite(Number(recipient.freeBalance))
        ? recipient.freeBalance
        : 0,
    );
  } else if (
    recipient?.balance != null &&
    Number.isFinite(Number(recipient.balance))
  ) {
    vars.잔액 = formatMoney(recipient.balance);
    if (
      recipient?.paidBalance != null &&
      Number.isFinite(Number(recipient.paidBalance))
    ) {
      vars.유료잔액 = formatMoney(recipient.paidBalance);
    }
    if (
      recipient?.freeBalance != null &&
      Number.isFinite(Number(recipient.freeBalance))
    ) {
      vars.무료잔액 = formatMoney(recipient.freeBalance);
    }
  }

  return vars;
}

function applyTemplateVars(text, vars) {
  return String(text || "").replace(/#\{([^}]+)\}/g, (full, key) => {
    const k = String(key || "").trim();
    const value = vars?.[k];
    if (value != null && String(value).trim() !== "") {
      return String(value);
    }
    return full;
  });
}

function findUnresolvedTemplateVars(text) {
  const matches = String(text || "").match(/#\{[^}]+\}/g);
  return matches ? Array.from(new Set(matches)) : [];
}

function buildPersonalizedMessages(templateText, recipients) {
  const unresolvedAll = new Set();
  const items = recipients.map((r) => {
    const vars = buildAutoTemplateVars(r);
    const content = applyTemplateVars(templateText, vars);
    for (const v of findUnresolvedTemplateVars(content)) unresolvedAll.add(v);
    return {
      phone: r.phone,
      name: r.name || r.companyName || "",
      content,
    };
  });
  return {
    items,
    unresolved: Array.from(unresolvedAll),
  };
}

export async function adminSendSms(req, res) {
  try {
    const bodyText = String(req.body?.text || "").trim();
    const recipientsRaw = normalizeRecipientsPayload(req.body);

    if (!recipientsRaw.length || !bodyText) {
      return res
        .status(400)
        .json({ success: false, message: "수신번호/내용을 확인하세요." });
    }

    const recipients = await enrichRecipientsWithBalances(recipientsRaw);
    const { items, unresolved } = buildPersonalizedMessages(
      bodyText,
      recipients,
    );
    if (unresolved.length) {
      return res.status(400).json({
        success: false,
        message: `템플릿 변수 ${unresolved.join(", ")} 는 자동 주입되지 않습니다. 실제 값으로 바꾼 뒤 발송하세요.`,
      });
    }

    const phones = items.map((i) => i.phone);

    try {
      const { receiptNum, method } = await sendPopbillXMS({
        items,
        subject: "관리자 발송",
      });

      await AdminSmsLog.create({
        to: phones,
        text: bodyText,
        status: "SENT",
        method,
        messageId: receiptNum,
        sentBy: req.user?._id,
        note: "Popbill XMS accepted (auto vars)",
      });

      return res.status(200).json({
        success: true,
        message: "전송 요청되었습니다.",
        data: { receiptNum, method },
      });
    } catch (sendError) {
      const errMsg =
        sendError?.message ||
        sendError?.Message ||
        String(sendError || "발송 실패");
      await AdminSmsLog.create({
        to: phones,
        text: bodyText,
        status: "FAILED",
        method: approxMessageBytes(items[0]?.content || bodyText) > 90
          ? "LMS"
          : "SMS",
        errorMessage: errMsg,
        sentBy: req.user?._id,
        note: "Popbill XMS failed",
      });
      return res.status(500).json({
        success: false,
        message: "문자 발송 실패",
        error: errMsg,
      });
    }
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
    const bodyText = String(req.body?.text || "").trim();
    const recipientsRaw = normalizeRecipientsPayload(req.body);
    const kakaoCode = String(req.body?.templateCode || "").trim();
    const wantKakao = Boolean(req.body?.useKakao) && !!kakaoCode;

    if (!recipientsRaw.length || !bodyText) {
      return res
        .status(400)
        .json({ success: false, message: "수신번호/내용을 확인하세요." });
    }

    const recipients = await enrichRecipientsWithBalances(recipientsRaw);
    const { items, unresolved } = buildPersonalizedMessages(
      bodyText,
      recipients,
    );
    if (unresolved.length) {
      return res.status(400).json({
        success: false,
        message: `템플릿 변수 ${unresolved.join(", ")} 는 자동 주입되지 않습니다. 실제 값으로 바꾼 뒤 발송하세요.`,
      });
    }

    const phones = items.map((i) => i.phone);

    try {
      let result;
      let note = "";
      let usedFallback = false;

      if (wantKakao) {
        try {
          result = await sendPopbillKakaoATS({
            items,
            templateCode: kakaoCode,
          });
          note = "Popbill ATS accepted (auto vars, alt SMS/LMS)";
        } catch (kakaoError) {
          // 알림톡 API 실패 시 문자로 대체
          result = await sendPopbillXMS({
            items,
            subject: "알림",
          });
          usedFallback = true;
          const kakaoMsg =
            kakaoError?.message ||
            kakaoError?.Message ||
            String(kakaoError || "알림톡 실패");
          note = `Kakao ATS failed → XMS fallback: ${kakaoMsg}`;
        }
      } else {
        result = await sendPopbillXMS({
          items,
          subject: "알림",
        });
        note = kakaoCode
          ? "Popbill XMS accepted (auto vars)"
          : "Popbill XMS accepted (no kakao template code)";
      }

      await AdminSmsLog.create({
        to: phones,
        text: bodyText,
        status: "SENT",
        method: result.method,
        messageId: result.receiptNum,
        sentBy: req.user?._id,
        note,
      });

      return res.status(200).json({
        success: true,
        message: usedFallback
          ? "알림톡 실패로 문자로 대체 발송되었습니다."
          : "전송 요청되었습니다.",
        data: {
          receiptNum: result.receiptNum,
          method: result.method,
          fallback: usedFallback,
        },
      });
    } catch (sendError) {
      const errMsg =
        sendError?.message ||
        sendError?.Message ||
        String(sendError || "발송 실패");
      await AdminSmsLog.create({
        to: phones,
        text: bodyText,
        status: "FAILED",
        method: wantKakao
          ? "KAKAO"
          : approxMessageBytes(items[0]?.content || bodyText) > 90
            ? "LMS"
            : "SMS",
        errorMessage: errMsg,
        sentBy: req.user?._id,
        note: "Popbill send failed",
      });
      return res.status(500).json({
        success: false,
        message: "메시지 발송 실패",
        error: errMsg,
      });
    }
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

    const templates = await listKakaoTemplates(
      corpNum,
      process.env.POPBILL_USER_ID || null,
    );
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

    // 코드가 비어 있는 템플릿이 있으면 팝빌 승인 목록으로 자동 연결 시도
    const missing = await AdminSmsTemplate.countDocuments({
      active: true,
      $or: [
        { kakaoTemplateCode: { $exists: false } },
        { kakaoTemplateCode: "" },
        { kakaoTemplateCode: null },
      ],
    });
    let syncMeta = null;
    if (missing > 0) {
      try {
        syncMeta = await syncKakaoTemplateCodes({ forceRematch: false });
      } catch {
        // 목록 조회는 실패하지 않음
      }
    }

    const includeInactive = String(req.query.includeInactive || "") === "true";
    const filter = includeInactive ? {} : { active: true };
    const rows = await AdminSmsTemplate.find(filter)
      .sort({ isSystem: -1, name: 1, updatedAt: -1 })
      .lean();
    return res.status(200).json({
      success: true,
      data: rows,
      meta: {
        autoVars: AUTO_SMS_TEMPLATE_VARS,
        manualVars: MANUAL_SMS_TEMPLATE_VARS,
        sync: syncMeta
          ? {
              linked: syncMeta.updates.length,
              popbillCount: syncMeta.popbillCount,
              popbillError: syncMeta.popbillError || "",
            }
          : null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "문자 템플릿 조회 실패",
      error: error.message,
    });
  }
}

export async function adminSyncSmsKakaoCodes(req, res) {
  try {
    const forceRematch = String(req.body?.force || req.query?.force || "") === "true";
    const result = await syncKakaoTemplateCodes({ forceRematch });
    const rows = await AdminSmsTemplate.find({ active: true })
      .sort({ isSystem: -1, name: 1, updatedAt: -1 })
      .lean();
    return res.status(200).json({
      success: true,
      message:
        result.updates.length > 0
          ? `${result.updates.length}개 템플릿에 알림톡 코드를 연결했습니다.`
          : result.popbillError
            ? `팝빌 조회 실패: ${result.popbillError}`
            : "새로 연결할 템플릿이 없습니다.",
      data: {
        templates: rows,
        updates: result.updates,
        popbillCount: result.popbillCount,
        popbillTemplates: result.popbillTemplates,
        popbillError: result.popbillError || "",
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "알림톡 코드 자동 연결 실패",
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
  adminSyncSmsKakaoCodes,
  adminCreateSmsTemplate,
  adminUpdateSmsTemplate,
  adminDeleteSmsTemplate,
};
