// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/frontend/src/pages/admin/support/AdminBusinessRegistrationInquiryPage.tsx
// - web/frontend/src/features/support/InquiriesPage.tsx
// change-log:
// - 2026-09-06: targetRoles — 영업 문의는 admin+salesTeam 전달, 영업팀 목록/답변 API.
// - 2026-08-15: lab_fee_item_add_request 자동 문의 유형 허용.
// - 2026-08-14: manufacturer_add_request 자동 문의 유형 허용.
// - 2026-08-11: 문의 type enum을 역할별 프리셋(크레딧/디자인/파일전송 등)까지 확장.
import { randomBytes } from "crypto";
import { uploadFileToS3 } from "../../utils/s3.utils.js";
import BusinessRegistrationInquiry from "../../models/businessRegistrationInquiry.model.js";
import { resolveBusinessType } from "../businesses/businessRole.util.js";
import { emitAppEventToRoles } from "../../socket.js";

const ALLOWED_INQUIRY_TYPES = [
  "general",
  "business_registration",
  "user_registration",
  "other",
  "manufacturing",
  "delivery",
  "billing",
  "credit",
  "design",
  "file_transfer",
  "account",
  "order_intake",
  "cam_machining",
  "equipment",
  "packing",
  "settlement",
  "referral_commission",
  "partnership",
  "operation",
  "system",
  "manufacturer_add_request",
  "lab_fee_item_add_request",
  "sales",
];

const buildUserSnapshot = (user) => ({
  name: String(user?.name || ""),
  email: String(user?.email || ""),
  role: String(user?.role || ""),
  business: String(user?.business || ""),
});

const normalizeTargetRoles = (body) => {
  const audience = String(body?.targetAudience || body?.audience || "")
    .trim()
    .toLowerCase();
  if (
    audience === "sales" ||
    audience === "salesteam" ||
    audience === "sales_team"
  ) {
    return ["admin", "salesTeam"];
  }
  const raw = Array.isArray(body?.targetRoles) ? body.targetRoles : [];
  const hasSales = raw.some(
    (r) =>
      String(r || "").trim() === "salesTeam" ||
      String(r || "").trim() === "sales",
  );
  if (hasSales) return ["admin", "salesTeam"];
  return ["admin"];
};

const inquiryNotifyRoles = (inquiry) => {
  const roles = Array.isArray(inquiry?.targetRoles)
    ? inquiry.targetRoles.map((r) => String(r || "").trim()).filter(Boolean)
    : [];
  if (roles.includes("salesTeam")) return ["admin", "salesTeam"];
  return ["admin"];
};

const buildInquiryRealtimePayload = (inquiry, action) => {
  if (!inquiry) return null;
  return {
    action: String(action || "").trim() || null,
    inquiryId: String(inquiry._id || "").trim() || null,
    status: String(inquiry.status || "").trim() || "open",
    type: String(inquiry.type || "").trim() || "general",
    subject: String(inquiry.subject || "").trim() || null,
    targetRoles: Array.isArray(inquiry.targetRoles)
      ? inquiry.targetRoles.map((r) => String(r))
      : ["admin"],
    createdAt: inquiry.createdAt || null,
    updatedAt: inquiry.updatedAt || null,
    userId: inquiry.user ? String(inquiry.user).trim() : null,
    businessAnchorId: inquiry.businessAnchorId
      ? String(inquiry.businessAnchorId).trim()
      : null,
    businessType: inquiry.businessType
      ? String(inquiry.businessType).trim()
      : null,
  };
};

const emitInquiryCreated = (inquiry) => {
  const roles = inquiryNotifyRoles(inquiry);
  emitAppEventToRoles(roles, "comm:badge-update", {
    key: "inquiry",
    delta: 1,
  });
  emitAppEventToRoles(roles, "support:inquiry-created", {
    inquiry: buildInquiryRealtimePayload(inquiry, "created"),
    unreadCountDelta: 1,
  });
};

const emitInquiryUpdated = (inquiry, prevStatus, nextStatus) => {
  const roles = inquiryNotifyRoles(inquiry);
  if (prevStatus !== nextStatus) {
    const delta =
      prevStatus === "open" && nextStatus === "resolved"
        ? -1
        : prevStatus === "resolved" && nextStatus === "open"
          ? 1
          : 0;
    if (delta !== 0) {
      emitAppEventToRoles(roles, "comm:badge-update", {
        key: "inquiry",
        delta,
      });
    }
  }
  emitAppEventToRoles(roles, "support:inquiry-updated", {
    inquiry: buildInquiryRealtimePayload(inquiry, "updated"),
    previousStatus: prevStatus,
    nextStatus,
  });
};

/**
 * 게스트 문의 접수 후 S3에 JSON으로 저장
 * @route POST /api/support/guest-inquiries
 */
export async function createGuestInquiry(req, res) {
  try {
    const { name, email, message } = req.body || {};

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "이름, 이메일, 문의 내용은 모두 필수입니다.",
      });
    }

    const now = new Date();
    const kstDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const [y, m, d] = kstDate.split("-");
    const randomId = randomBytes(8).toString("hex");

    const payload = {
      name,
      email,
      message,
      createdAt: now.toISOString(),
      ip: req.ip,
      userAgent: req.get("user-agent") || null,
    };

    const jsonBuffer = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
    const key = `guest-inquiries/${y}/${m}/${d}/${Date.now()}-${randomId}.json`;

    const result = await uploadFileToS3(
      jsonBuffer,
      key,
      "application/json; charset=utf-8",
    );

    return res.status(201).json({
      success: true,
      message: "문의가 성공적으로 접수되었습니다.",
      data: {
        key: result.key || key,
        location: result.location || null,
      },
    });
  } catch (error) {
    console.error("게스트 문의 저장 중 오류:", error);
    return res.status(500).json({
      success: false,
      message: "문의 저장 중 오류가 발생했습니다.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

/**
 * 일반 문의 접수 (로그인 필요)
 * @route POST /api/support/inquiries
 */
export async function createInquiry(req, res) {
  try {
    const { type, subject, message } = req.body || {};
    const normalizedType = ALLOWED_INQUIRY_TYPES.includes(
      String(type || "").trim(),
    )
      ? String(type).trim()
      : "general";
    const trimmedSubject = String(subject || "").trim();
    const trimmedMessage = String(message || "").trim();
    const targetRoles = normalizeTargetRoles(req.body || {});

    if (!trimmedMessage) {
      return res.status(400).json({
        success: false,
        message: "문의 내용을 입력해주세요.",
      });
    }

    const inquiry = await BusinessRegistrationInquiry.create({
      user: req.user._id,
      businessAnchorId: req.user?.businessAnchorId || null,
      businessType: req.user?.role || null,
      userSnapshot: buildUserSnapshot(req.user),
      type: normalizedType,
      subject: trimmedSubject,
      message: trimmedMessage,
      targetRoles,
    });

    emitInquiryCreated(inquiry);

    return res.status(201).json({
      success: true,
      message: "문의가 접수되었습니다.",
      data: {
        id: inquiry._id,
        createdAt: inquiry.createdAt,
        targetRoles,
      },
    });
  } catch (error) {
    console.error("문의 저장 중 오류:", error);
    return res.status(500).json({
      success: false,
      message: "문의 저장 중 오류가 발생했습니다.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

/**
 * 내 문의 목록
 * @route GET /api/support/inquiries
 */
export async function listMyInquiries(req, res) {
  try {
    const status = String(req.query?.status || "").trim();
    const type = String(req.query?.type || "").trim();
    const limit = Math.min(200, Number(req.query?.limit || 50) || 50);
    const filter = { user: req.user._id };
    if (status) filter.status = status;
    if (type) filter.type = type;

    const inquiries = await BusinessRegistrationInquiry.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ success: true, data: inquiries });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "문의 목록 조회 중 오류가 발생했습니다.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

/**
 * 사업자등록 문의 접수 (로그인 필요)
 * @route POST /api/support/business-registration-inquiries
 */
export async function createBusinessRegistrationInquiry(req, res) {
  try {
    const { reason, ownerForm, license, businessType, errorMessage } =
      req.body || {};
    const resolvedType = resolveBusinessType(req.user, businessType);
    if (!resolvedType) {
      return res.status(403).json({
        success: false,
        message: "이 작업을 수행할 권한이 없습니다.",
      });
    }

    const userSnapshot = buildUserSnapshot(req.user);

    const inquiry = await BusinessRegistrationInquiry.create({
      user: req.user._id,
      businessAnchorId: req.user?.businessAnchorId || null,
      businessType: resolvedType,
      userSnapshot,
      type: "business_registration",
      subject: "사업자등록 문의",
      message: String(reason || "").trim(),
      reason: String(reason || "").trim(),
      targetRoles: ["admin"],
      payload: {
        role: String(req.user?.role || ""),
        ownerForm: ownerForm || null,
        license: license || null,
        errorMessage: String(errorMessage || "").trim(),
      },
    });

    emitInquiryCreated(inquiry);

    return res.status(201).json({
      success: true,
      message: "문의가 접수되었습니다.",
      data: {
        id: inquiry._id,
        createdAt: inquiry.createdAt,
      },
    });
  } catch (error) {
    console.error("사업자등록 문의 저장 중 오류:", error);
    return res.status(500).json({
      success: false,
      message: "문의 저장 중 오류가 발생했습니다.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

/**
 * 사업자등록 문의 목록 (관리자)
 * @route GET /api/admin/business-registration-inquiries
 */
export async function adminListBusinessRegistrationInquiries(req, res) {
  try {
    const status = String(req.query?.status || "").trim();
    const type = String(req.query?.type || "").trim();
    const target = String(req.query?.target || "").trim();
    const limit = Math.min(200, Number(req.query?.limit || 50) || 50);
    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (target === "salesTeam") filter.targetRoles = "salesTeam";
    const inquiries = await BusinessRegistrationInquiry.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("user", "name email role business")
      .lean();
    return res.json({ success: true, data: inquiries });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "문의 목록 조회 중 오류가 발생했습니다.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

/**
 * 사업자등록 문의 상세 (관리자)
 * @route GET /api/admin/business-registration-inquiries/:id
 */
export async function adminGetBusinessRegistrationInquiry(req, res) {
  try {
    const inquiry = await BusinessRegistrationInquiry.findById(req.params.id)
      .populate("user", "name email role business")
      .lean();
    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: "문의 내역을 찾을 수 없습니다.",
      });
    }
    return res.json({ success: true, data: inquiry });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "문의 상세 조회 중 오류가 발생했습니다.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

/**
 * 사업자등록 문의 처리 (관리자)
 * @route PATCH /api/admin/business-registration-inquiries/:id
 */
export async function adminResolveBusinessRegistrationInquiry(req, res) {
  try {
    const { status, adminNote } = req.body || {};
    const nextStatus = status === "resolved" ? "resolved" : "open";

    const prevInquiry = await BusinessRegistrationInquiry.findById(req.params.id)
      .select("status targetRoles")
      .lean();
    if (!prevInquiry) {
      return res.status(404).json({
        success: false,
        message: "문의 내역을 찾을 수 없습니다.",
      });
    }

    const prevStatus = String(prevInquiry.status || "open").trim() || "open";

    const update = {
      status: nextStatus,
      adminNote: String(adminNote || "").trim(),
      resolvedAt: nextStatus === "resolved" ? new Date() : null,
      resolvedBy: nextStatus === "resolved" ? req.user?._id : null,
    };

    const inquiry = await BusinessRegistrationInquiry.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true },
    )
      .populate("user", "name email role business")
      .lean();

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: "문의 내역을 찾을 수 없습니다.",
      });
    }

    emitInquiryUpdated(inquiry, prevStatus, nextStatus);

    return res.json({ success: true, data: inquiry });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "문의 처리 중 오류가 발생했습니다.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

/**
 * 영업 대상 문의 목록 (영업본부 · 관리자)
 * @route GET /api/sales-team/inquiries
 */
export async function salesTeamListInquiries(req, res) {
  try {
    const status = String(req.query?.status || "").trim();
    const type = String(req.query?.type || "").trim();
    const limit = Math.min(200, Number(req.query?.limit || 50) || 50);
    const filter = { targetRoles: "salesTeam" };
    if (status) filter.status = status;
    if (type) filter.type = type;
    const inquiries = await BusinessRegistrationInquiry.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("user", "name email role business")
      .lean();
    return res.json({ success: true, data: inquiries });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "문의 목록 조회 중 오류가 발생했습니다.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

/**
 * 영업 대상 문의 답변 (영업본부 · 관리자)
 * @route PATCH /api/sales-team/inquiries/:id
 */
export async function salesTeamResolveInquiry(req, res) {
  try {
    const { status, adminNote } = req.body || {};
    const nextStatus = status === "resolved" ? "resolved" : "open";

    const prevInquiry = await BusinessRegistrationInquiry.findById(req.params.id)
      .select("status targetRoles")
      .lean();
    if (!prevInquiry) {
      return res.status(404).json({
        success: false,
        message: "문의 내역을 찾을 수 없습니다.",
      });
    }

    const targets = Array.isArray(prevInquiry.targetRoles)
      ? prevInquiry.targetRoles.map((r) => String(r))
      : [];
    if (!targets.includes("salesTeam")) {
      return res.status(403).json({
        success: false,
        message: "영업 대상 문의만 답변할 수 있습니다.",
      });
    }

    const prevStatus = String(prevInquiry.status || "open").trim() || "open";

    const inquiry = await BusinessRegistrationInquiry.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status: nextStatus,
          adminNote: String(adminNote || "").trim(),
          resolvedAt: nextStatus === "resolved" ? new Date() : null,
          resolvedBy: nextStatus === "resolved" ? req.user?._id : null,
        },
      },
      { new: true },
    )
      .populate("user", "name email role business")
      .lean();

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: "문의 내역을 찾을 수 없습니다.",
      });
    }

    emitInquiryUpdated(inquiry, prevStatus, nextStatus);

    return res.json({ success: true, data: inquiry });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "문의 처리 중 오류가 발생했습니다.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

export default {
  createGuestInquiry,
  createBusinessRegistrationInquiry,
  createInquiry,
  listMyInquiries,
  adminListBusinessRegistrationInquiries,
  adminGetBusinessRegistrationInquiry,
  adminResolveBusinessRegistrationInquiry,
  salesTeamListInquiries,
  salesTeamResolveInquiry,
};
