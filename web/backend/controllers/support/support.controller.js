import { randomBytes } from "crypto";
import { uploadFileToS3 } from "../../utils/s3.utils.js";
import BusinessRegistrationInquiry from "../../models/businessRegistrationInquiry.model.js";
import { resolveOrganizationType } from "../organizations/organizationRole.util.js";

const buildUserSnapshot = (user) => ({
  name: String(user?.name || ""),
  email: String(user?.email || ""),
  role: String(user?.role || ""),
  organization: String(user?.organization || ""),
});

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
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const d = String(now.getUTCDate()).padStart(2, "0");
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
    const normalizedType =
      type === "business_registration" || type === "user_registration"
        ? type
        : "general";
    const trimmedSubject = String(subject || "").trim();
    const trimmedMessage = String(message || "").trim();

    if (!trimmedMessage) {
      return res.status(400).json({
        success: false,
        message: "문의 내용을 입력해주세요.",
      });
    }

    const inquiry = await BusinessRegistrationInquiry.create({
      user: req.user._id,
      organizationId: req.user?.organizationId || null,
      organizationType: req.user?.role || null,
      userSnapshot: buildUserSnapshot(req.user),
      type: normalizedType,
      subject: trimmedSubject,
      message: trimmedMessage,
    });

    return res.status(201).json({
      success: true,
      message: "문의가 접수되었습니다.",
      data: {
        id: inquiry._id,
        createdAt: inquiry.createdAt,
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
    const { reason, ownerForm, license, organizationType, errorMessage } =
      req.body || {};
    const resolvedType = resolveOrganizationType(req.user, organizationType);
    if (!resolvedType) {
      return res.status(403).json({
        success: false,
        message: "이 작업을 수행할 권한이 없습니다.",
      });
    }

    const userSnapshot = buildUserSnapshot(req.user);

    const inquiry = await BusinessRegistrationInquiry.create({
      user: req.user._id,
      organizationId: req.user?.organizationId || null,
      organizationType: resolvedType,
      userSnapshot,
      type: "business_registration",
      subject: "사업자등록 문의",
      message: String(reason || "").trim(),
      reason: String(reason || "").trim(),
      payload: {
        role: String(req.user?.role || ""),
        ownerForm: ownerForm || null,
        license: license || null,
        errorMessage: String(errorMessage || "").trim(),
      },
    });

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
    const limit = Math.min(200, Number(req.query?.limit || 50) || 50);
    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    const inquiries = await BusinessRegistrationInquiry.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("user", "name email role organization")
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
      .populate("user", "name email role organization")
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
      .populate("user", "name email role organization")
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
};
