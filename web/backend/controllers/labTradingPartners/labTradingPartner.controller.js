// related files:
// - web/backend/rules.md
// - web/backend/models/labTradingPartner.model.js
// - web/backend/utils/labTradingPartner.util.js
// - web/backend/utils/labFeeSchedule.js
// - web/frontend/src/features/settings/tabs/LabTradingPartnersTab.tsx
import { Types } from "mongoose";
import LabTradingPartner from "../../models/labTradingPartner.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import {
  createInviteToken,
  resolveLabTradingPartnerWindow,
  activateLabTradingPartnerInvite,
} from "../../utils/labTradingPartner.util.js";
import {
  normalizeLabFeeSchedule,
  LAB_FEE_SCHEDULE_DEFAULTS,
} from "../../utils/labFeeSchedule.js";
import {
  normalizeRequestorKind,
  resolveRequestorProfile,
} from "../../utils/requestorCapabilities.js";

/**
 * 기공소 앵커 해석 — getMyBusiness와 동일하게 User/Anchor 프로필 SSOT 사용.
 * (앵커 requestorKind 미기입·유저 미러만 lab인 경우에도 403 방지)
 */
async function resolveCallerLabAnchorId(req) {
  const userId = req.user?._id;
  if (!userId) return null;

  const freshUser = await User.findById(userId)
    .select({
      businessAnchorId: 1,
      requestorKind: 1,
      requestorServices: 1,
      requestorCapabilities: 1,
      role: 1,
    })
    .lean();

  const candidateIds = [];
  const pushId = (raw) => {
    const id = String(raw || "").trim();
    if (id && Types.ObjectId.isValid(id) && !candidateIds.includes(id)) {
      candidateIds.push(id);
    }
  };
  pushId(freshUser?.businessAnchorId);
  pushId(req.user?.businessAnchorId);

  const membershipAnchors = await BusinessAnchor.find({
    businessType: "requestor",
    $or: [
      { primaryContactUserId: userId },
      { owners: userId },
      { members: userId },
    ],
  })
    .select({
      _id: 1,
      businessType: 1,
      requestorKind: 1,
      requestorServices: 1,
      requestorCapabilities: 1,
      status: 1,
    })
    .lean();

  for (const a of membershipAnchors || []) {
    pushId(a?._id);
  }

  const byId = new Map(
    (membershipAnchors || []).map((a) => [String(a._id), a]),
  );

  for (const id of candidateIds) {
    let anchor = byId.get(id);
    if (!anchor) {
      anchor = await BusinessAnchor.findById(id)
        .select({
          _id: 1,
          businessType: 1,
          requestorKind: 1,
          requestorServices: 1,
          requestorCapabilities: 1,
          status: 1,
        })
        .lean();
    }
    if (!anchor || String(anchor.businessType || "") !== "requestor") continue;

    const businessVerified =
      String(anchor.status || "") === "verified" ||
      Boolean(anchor?.verification?.verified);
    const profile = resolveRequestorProfile({
      anchorKind: anchor.requestorKind,
      anchorServices: anchor.requestorServices,
      anchorCaps: anchor.requestorCapabilities,
      userKind: freshUser?.requestorKind ?? req.user?.requestorKind,
      userServices: freshUser?.requestorServices ?? req.user?.requestorServices,
      userCaps:
        freshUser?.requestorCapabilities ?? req.user?.requestorCapabilities,
      userRole: freshUser?.role || req.user?.role,
      businessVerified,
    });
    if (normalizeRequestorKind(profile.kind) === "lab") {
      return String(anchor._id);
    }
  }

  return null;
}

function buildInvitePath(token) {
  return `/signup?labPartner=${encodeURIComponent(token)}`;
}

export async function getLabTradingPartnerWindow(req, res) {
  try {
    const labAnchorId = await resolveCallerLabAnchorId(req);
    if (!labAnchorId) {
      return res.status(403).json({
        success: false,
        message: "기공소 사업자만 이용할 수 있습니다.",
      });
    }
    const window = await resolveLabTradingPartnerWindow({ labAnchorId });
    return res.json({ success: true, data: { labAnchorId, ...window } });
  } catch (e) {
    console.error("[labTradingPartners] window error", e);
    return res.status(500).json({
      success: false,
      message: "거래처 등록 기간을 조회하지 못했습니다.",
    });
  }
}

export async function listLabTradingPartners(req, res) {
  try {
    const labAnchorId = await resolveCallerLabAnchorId(req);
    if (!labAnchorId) {
      return res.status(403).json({
        success: false,
        message: "기공소 사업자만 이용할 수 있습니다.",
      });
    }
    const window = await resolveLabTradingPartnerWindow({ labAnchorId });
    const rows = await LabTradingPartner.find({
      labAnchorId: new Types.ObjectId(labAnchorId),
      status: { $in: ["invited", "active"] },
    })
      .sort({ invitedAt: -1 })
      .lean();

    const practiceIds = rows
      .map((r) => r.practiceAnchorId)
      .filter(Boolean)
      .map((id) => String(id));
    const practices =
      practiceIds.length > 0
        ? await BusinessAnchor.find({
            _id: {
              $in: practiceIds.map((id) => new Types.ObjectId(id)),
            },
          })
            .select({ _id: 1, name: 1, status: 1, metadata: 1 })
            .lean()
        : [];
    const practiceById = new Map(
      practices.map((p) => [String(p._id), p]),
    );

    const items = rows.map((row) => {
      const practice = row.practiceAnchorId
        ? practiceById.get(String(row.practiceAnchorId))
        : null;
      return {
        _id: String(row._id),
        status: row.status,
        inviteToken: row.inviteToken,
        invitePath: buildInvitePath(row.inviteToken),
        practiceHint: row.practiceHint || {},
        invitedAt: row.invitedAt,
        activatedAt: row.activatedAt,
        practiceAnchorId: row.practiceAnchorId
          ? String(row.practiceAnchorId)
          : null,
        practiceName:
          practice?.name ||
          practice?.metadata?.companyName ||
          row.practiceHint?.name ||
          "",
        practiceStatus: practice?.status || null,
      };
    });

    return res.json({
      success: true,
      data: { items, window: { labAnchorId, ...window } },
    });
  } catch (e) {
    console.error("[labTradingPartners] list error", e);
    return res.status(500).json({
      success: false,
      message: "거래처 목록을 조회하지 못했습니다.",
    });
  }
}

export async function createLabTradingPartnerInvite(req, res) {
  try {
    const labAnchorId = await resolveCallerLabAnchorId(req);
    if (!labAnchorId) {
      return res.status(403).json({
        success: false,
        message: "기공소 사업자만 이용할 수 있습니다.",
      });
    }
    const window = await resolveLabTradingPartnerWindow({ labAnchorId });
    if (!window.canInvite) {
      return res.status(403).json({
        success: false,
        reason: "window_closed",
        message:
          "가입 후 30일이 지나 신규 거래 치과 등록이 불가합니다. 기존 등록은 유지됩니다.",
        data: window,
      });
    }

    const name = String(req.body?.name || req.body?.practiceHint?.name || "").trim();
    const phone = String(
      req.body?.phone || req.body?.practiceHint?.phone || "",
    ).trim();
    const memo = String(
      req.body?.memo || req.body?.practiceHint?.memo || "",
    ).trim();

    const inviteToken = createInviteToken();
    const doc = await LabTradingPartner.create({
      labAnchorId: new Types.ObjectId(labAnchorId),
      inviteToken,
      status: "invited",
      practiceHint: { name, phone, memo },
      invitedAt: new Date(),
      invitedByUserId: req.user?._id || null,
    });

    return res.status(201).json({
      success: true,
      data: {
        _id: String(doc._id),
        status: doc.status,
        inviteToken: doc.inviteToken,
        invitePath: buildInvitePath(doc.inviteToken),
        practiceHint: doc.practiceHint,
        invitedAt: doc.invitedAt,
        window,
      },
    });
  } catch (e) {
    console.error("[labTradingPartners] create error", e);
    return res.status(500).json({
      success: false,
      message: "거래처 초대를 생성하지 못했습니다.",
    });
  }
}

export async function cancelLabTradingPartnerInvite(req, res) {
  try {
    const labAnchorId = await resolveCallerLabAnchorId(req);
    if (!labAnchorId) {
      return res.status(403).json({
        success: false,
        message: "기공소 사업자만 이용할 수 있습니다.",
      });
    }
    const id = String(req.params?.id || "").trim();
    if (!id || !Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "잘못된 ID입니다." });
    }
    const doc = await LabTradingPartner.findOne({
      _id: new Types.ObjectId(id),
      labAnchorId: new Types.ObjectId(labAnchorId),
    });
    if (!doc) {
      return res.status(404).json({ success: false, message: "초대를 찾을 수 없습니다." });
    }
    if (doc.status === "canceled") {
      return res.json({ success: true, data: { canceled: true, already: true } });
    }
    if (doc.status === "active") {
      return res.status(409).json({
        success: false,
        message: "등록 완료된 거래처는 이 화면에서 취소할 수 없습니다.",
      });
    }
    doc.status = "canceled";
    doc.canceledAt = new Date();
    await doc.save();
    return res.json({ success: true, data: { canceled: true } });
  } catch (e) {
    console.error("[labTradingPartners] cancel error", e);
    return res.status(500).json({
      success: false,
      message: "초대를 취소하지 못했습니다.",
    });
  }
}

export async function getInvitePreview(req, res) {
  try {
    const token = String(req.query?.token || req.params?.token || "").trim();
    if (!token) {
      return res.status(400).json({ success: false, message: "토큰이 필요합니다." });
    }
    const invite = await LabTradingPartner.findOne({ inviteToken: token })
      .select({
        status: 1,
        labAnchorId: 1,
        practiceHint: 1,
        invitedAt: 1,
      })
      .lean();
    if (!invite) {
      return res.status(404).json({ success: false, message: "초대를 찾을 수 없습니다." });
    }
    const lab = await BusinessAnchor.findById(invite.labAnchorId)
      .select({ name: 1 })
      .lean();
    return res.json({
      success: true,
      data: {
        status: invite.status,
        labName: lab?.name || "",
        practiceHint: invite.practiceHint || {},
        invitedAt: invite.invitedAt,
      },
    });
  } catch (e) {
    console.error("[labTradingPartners] preview error", e);
    return res.status(500).json({
      success: false,
      message: "초대 정보를 조회하지 못했습니다.",
    });
  }
}

export async function bindLabTradingPartnerInvite(req, res) {
  try {
    const token = String(req.body?.token || req.body?.labPartner || "").trim();
    const practiceAnchorId = String(
      req.user?.businessAnchorId || req.body?.practiceAnchorId || "",
    ).trim();
    const kind = normalizeRequestorKind(
      req.user?.requestorKind || req.body?.requestorKind,
    );
    const result = await activateLabTradingPartnerInvite({
      inviteToken: token,
      practiceAnchorId,
      practiceKind: kind || "practice",
    });
    if (!result.activated) {
      return res.status(409).json({
        success: false,
        reason: result.reason,
        message: "거래처 등록을 완료하지 못했습니다.",
      });
    }
    return res.json({
      success: true,
      data: {
        activated: true,
        reason: result.reason,
        partnerId: result.partner?._id
          ? String(result.partner._id)
          : null,
      },
    });
  } catch (e) {
    console.error("[labTradingPartners] bind error", e);
    return res.status(500).json({
      success: false,
      message: "거래처 등록을 완료하지 못했습니다.",
    });
  }
}

export async function getLabFeeSchedule(req, res) {
  try {
    const labAnchorId = await resolveCallerLabAnchorId(req);
    if (!labAnchorId) {
      return res.status(403).json({
        success: false,
        message: "기공소 사업자만 이용할 수 있습니다.",
      });
    }
    const lab = await BusinessAnchor.findById(labAnchorId)
      .select({ labFeeSchedule: 1 })
      .lean();
    const schedule = normalizeLabFeeSchedule(
      lab?.labFeeSchedule || LAB_FEE_SCHEDULE_DEFAULTS,
    );
    return res.json({
      success: true,
      data: {
        schedule,
        updatedAt: lab?.labFeeSchedule?.updatedAt || null,
      },
    });
  } catch (e) {
    console.error("[labTradingPartners] getLabFeeSchedule error", e);
    return res.status(500).json({
      success: false,
      message: "기공비를 조회하지 못했습니다.",
    });
  }
}

export async function updateLabFeeSchedule(req, res) {
  try {
    const labAnchorId = await resolveCallerLabAnchorId(req);
    if (!labAnchorId) {
      return res.status(403).json({
        success: false,
        message: "기공소 사업자만 이용할 수 있습니다.",
      });
    }
    const schedule = normalizeLabFeeSchedule(req.body?.schedule || req.body);
    const updated = await BusinessAnchor.findByIdAndUpdate(
      labAnchorId,
      {
        $set: {
          labFeeSchedule: {
            ...schedule,
            updatedAt: new Date(),
          },
        },
      },
      { new: true, select: { labFeeSchedule: 1 } },
    ).lean();
    return res.json({
      success: true,
      data: {
        schedule: normalizeLabFeeSchedule(updated?.labFeeSchedule),
        updatedAt: updated?.labFeeSchedule?.updatedAt || null,
      },
    });
  } catch (e) {
    console.error("[labTradingPartners] updateLabFeeSchedule error", e);
    return res.status(500).json({
      success: false,
      message: "기공비를 저장하지 못했습니다.",
    });
  }
}

export { activateLabTradingPartnerInvite };
