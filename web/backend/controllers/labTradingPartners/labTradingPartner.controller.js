// related files:
// - web/backend/rules.md
// - web/backend/models/labTradingPartner.model.js
// - web/backend/utils/labTradingPartner.util.js
// - web/backend/utils/labFeeSchedule.js
// - web/frontend/src/features/settings/tabs/LabTradingPartnersTab.tsx
// - web/frontend/src/features/settings/LabFeeSetupPrompt.tsx
// - 2026-08-19: configured=제공 항목 수가 있음. active=마스터 스위치.
// - 2026-08-14: 기공비 저장 시 quote-context 캐시 무효화.
// - 2026-08-14: 치과별 기공수가 할증 저장 시 해당 치과 사용자에 app-event 이밋.
// - 2026-08-15: 할증 upsert 시 history 보존(1x 해제·배수 변경도 기존 의뢰 소급 금지).
// - 2026-08-14: 기공소 신규 기공비 → 어벗츠 수가(off·검토) 동기화 + 관리자 알림.
// - 2026-08-15: internalLab 기공비 API 허용. 미저장 시 관리자 어벗츠 수가 카탈로그 복사.
// - 2026-08-20: 치과별 기공수가 할증도 internalLab 허용(라우트 authorize).
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
  normalizeLabFeeScheduleEnabled,
  normalizeLabFeeRemakeSchedule,
  normalizeLabFeeItems,
  legacyLabFeeScheduleFromItems,
  isLabFeeScheduleConfigured,
  isLabFeeScheduleReadyToCharge,
  resolveLabFeeScheduleForSettings,
  normalizeLabFeeMultiplier,
  resolveLabPracticeFeeMultiplier,
  upsertLabPracticeFeeMultiplierList,
  buildDefaultLabFeeSchedule,
} from "../../utils/labFeeSchedule.js";
import {
  loadAbutsLabFeeSchedule,
  syncNewLabFeeItemsToAbutsCatalog,
} from "../../utils/abutsLabFeeSchedule.js";
import {
  normalizeRequestorKind,
  resolveRequestorProfile,
} from "../../utils/requestorCapabilities.js";
import {
  resolvePlatformFeeRate,
} from "../../services/creditRevenuePolicy.service.js";
import { invalidatePracticeTransferQuoteCaches } from "../../services/practiceTransferBilling.service.js";
import { emitAppEventToRoles, emitAppEventToUser } from "../../socket.js";

/**
 * 설정 UI용 수가. 저장된 항목이 없으면 관리자 기본 기공수가(카탈로그)를 복사.
 * (하드코딩 기본값보다 관리자「기본 기공수가」SSOT 우선. 기존 기공소는 덮어쓰지 않음)
 */
async function resolveLabFeeScheduleForSettingsFromCatalog(schedule) {
  const hasItems =
    Array.isArray(schedule?.items) && schedule.items.length > 0;
  if (hasItems) {
    return schedule;
  }
  try {
    const abuts = await loadAbutsLabFeeSchedule();
    const catalogItems = normalizeLabFeeItems({
      items: Array.isArray(abuts?.items) ? abuts.items : [],
    }).filter((item) => item?.name && item.pendingReview !== true);
    if (catalogItems.length) {
      return {
        ...buildDefaultLabFeeSchedule(),
        ...(schedule && typeof schedule === "object" ? schedule : {}),
        items: catalogItems.map((item) => ({
          ...item,
          pendingReview: false,
          proposedByLabName: "",
          proposedByLabAnchorId: "",
          proposedAt: null,
        })),
        active: false,
      };
    }
  } catch (error) {
    console.warn(
      "[labTradingPartners] abuts catalog seed failed",
      error?.message || error,
    );
  }
  return resolveLabFeeScheduleForSettings(schedule);
}

/** 기공소 설정 화면 표시용 플랫폼 수수료율 조회 (개발운영사 설정 SSOT: BusinessAnchor.payoutRates) */
async function resolvePlatformFeeRatesForDisplay() {
  const devops = await BusinessAnchor.findOne({ businessType: "devops" })
    .select({ payoutRates: 1 })
    .sort({ createdAt: 1 })
    .lean();
  const platformFeeRate = resolvePlatformFeeRate(devops?.payoutRates);
  return {
    platformFeeRate,
    partnerFeeRate: platformFeeRate,
    nonPartnerFeeRate: platformFeeRate,
  };
}

/**
 * 기공소 앵커 해석 — getMyBusiness와 동일하게 User/Anchor 프로필 SSOT 사용.
 * (앵커 requestorKind 미기입·유저 미러만 lab인 경우에도 403 방지)
 * internalLab(어벗츠기공소)도 기공비·거래처 API 호출 가능.
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

  const role = String(freshUser?.role || req.user?.role || "").trim();
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
    businessType: { $in: ["requestor", "internalLab"] },
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
    if (!anchor) continue;

    const businessType = String(anchor.businessType || "").trim();
    if (businessType === "internalLab") {
      if (role === "internalLab" || role === "admin") {
        return String(anchor._id);
      }
      continue;
    }
    if (businessType !== "requestor") continue;

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

/** 치과별 할증 변경 → 해당 치과(practice/requestor) 사용자 app-event. */
async function emitLabFeeMultiplierUpdatedToPractice({
  practiceAnchorId,
  labAnchorId,
  labFeeMultiplier,
}) {
  try {
    const practiceId = String(practiceAnchorId || "").trim();
    const labId = String(labAnchorId || "").trim();
    if (!practiceId || !Types.ObjectId.isValid(practiceId)) return;

    const users = await User.find({
      businessAnchorId: new Types.ObjectId(practiceId),
      role: { $in: ["practice", "requestor"] },
      active: true,
    })
      .select({ _id: 1 })
      .lean();

    const payload = {
      labAnchorId: labId || null,
      practiceAnchorId: practiceId,
      labFeeMultiplier: normalizeLabFeeMultiplier(labFeeMultiplier),
      emittedAt: new Date().toISOString(),
    };

    for (const user of users) {
      const userId = String(user?._id || "").trim();
      if (!userId) continue;
      emitAppEventToUser(userId, "practice:lab-fee-multiplier-updated", payload);
    }
  } catch {
    // 실시간 이벤트 실패가 본 API 성공/실패를 좌우하지 않도록 무시
  }
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
    const feeRates = await resolvePlatformFeeRatesForDisplay();
    return res.json({
      success: true,
      data: { labAnchorId, ...window, feeRates },
    });
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
    const feeRates = await resolvePlatformFeeRatesForDisplay();
    const rows = await LabTradingPartner.find({
      labAnchorId: new Types.ObjectId(labAnchorId),
      // 초대 링크만 만든 invited는 목록에 올리지 않음.
      // 치과가 가입·사업자 연결을 시작하면 pending → 검증 후 active(거래처)/referred(소개).
      status: { $in: ["pending", "active", "referred"] },
    })
      .sort({ invitedAt: -1 })
      .lean();

    const labDoc = await BusinessAnchor.findById(labAnchorId)
      .select({ labPracticeFeeMultipliers: 1 })
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
            .select({
              _id: 1,
              name: 1,
              status: 1,
              metadata: 1,
            })
            .lean()
        : [];
    const practiceById = new Map(
      practices.map((p) => [String(p._id), p]),
    );

    const formatPracticeAddress = (meta) => {
      const line1 = String(meta?.address || "").trim();
      const line2 = String(meta?.addressDetail || "").trim();
      return [line1, line2].filter(Boolean).join(" ");
    };

    const items = rows.map((row) => {
      const practice = row.practiceAnchorId
        ? practiceById.get(String(row.practiceAnchorId))
        : null;
      const meta = practice?.metadata || {};
      const practiceAnchorId = row.practiceAnchorId
        ? String(row.practiceAnchorId)
        : null;
      return {
        _id: String(row._id),
        status: row.status,
        inviteToken: row.inviteToken,
        invitePath: buildInvitePath(row.inviteToken),
        practiceHint: row.practiceHint || {},
        invitedAt: row.invitedAt,
        activatedAt: row.activatedAt,
        practiceAnchorId,
        practiceName:
          practice?.name ||
          meta?.companyName ||
          row.practiceHint?.name ||
          "",
        practiceAddress: formatPracticeAddress(meta),
        practiceRepresentativeName: String(
          meta?.representativeName || "",
        ).trim(),
        practiceStatus: practice?.status || null,
        boundAt: row.boundAt || null,
        labFeeMultiplier: practiceAnchorId
          ? resolveLabPracticeFeeMultiplier(labDoc, practiceAnchorId)
          : 1,
      };
    });

    return res.json({
      success: true,
      data: { items, window: { labAnchorId, ...window, feeRates } },
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
    // 등록 기간이 지나도 초대(소개) 발급 자체는 계속 허용한다.
    // 다만 이 기간 이후 발급된 초대는 검증 완료 시 active(등록 치과)가 아닌
    // referred(기간 후 등록)로 승격된다. 플랫폼 수수료는 등록 여부와 무관하다.
    const invitedAfterWindow = !window.canInvite;

    // 링크/안내문구 복사용 토큰만 발급. 목록 카드는 치과 가입(pending) 때부터 표시.
    const inviteToken = createInviteToken();
    const doc = await LabTradingPartner.create({
      labAnchorId: new Types.ObjectId(labAnchorId),
      inviteToken,
      status: "invited",
      invitedAfterWindow,
      practiceHint: { name: "", phone: "", memo: "" },
      invitedAt: new Date(),
      invitedByUserId: req.user?._id || null,
    });

    return res.status(201).json({
      success: true,
      data: {
        _id: String(doc._id),
        status: doc.status,
        invitedAfterWindow: doc.invitedAfterWindow,
        inviteToken: doc.inviteToken,
        invitePath: buildInvitePath(doc.inviteToken),
        practiceHint: doc.practiceHint,
        invitedAt: doc.invitedAt,
        window,
        listed: false,
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
    if (doc.status === "active" || doc.status === "referred") {
      return res.status(409).json({
        success: false,
        message: "등록 완료된 거래처는 이 화면에서 취소할 수 없습니다.",
      });
    }
    if (doc.status === "pending") {
      return res.status(409).json({
        success: false,
        message:
          "가입 진행 중인 거래처는 취소할 수 없습니다. 사업자 검증이 끝나면 등록 완료됩니다.",
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
    let verified = Boolean(req.body?.verified);
    if (practiceAnchorId && Types.ObjectId.isValid(practiceAnchorId)) {
      const practice = await BusinessAnchor.findById(practiceAnchorId)
        .select({ status: 1 })
        .lean();
      if (String(practice?.status || "") === "verified") verified = true;
    }
    const result = await activateLabTradingPartnerInvite({
      inviteToken: token,
      practiceAnchorId,
      practiceKind: kind || "practice",
      verified,
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
    const active = isLabFeeScheduleConfigured(lab?.labFeeSchedule);
    const configured = isLabFeeScheduleReadyToCharge(lab?.labFeeSchedule);
    const source = await resolveLabFeeScheduleForSettingsFromCatalog(
      lab?.labFeeSchedule,
    );
    const items = normalizeLabFeeItems(source);
    const schedule = normalizeLabFeeSchedule(source);
    const remake = normalizeLabFeeRemakeSchedule(source);
    const enabled = normalizeLabFeeScheduleEnabled(source);
    return res.json({
      success: true,
      data: {
        items,
        schedule,
        remake,
        enabled,
        active,
        configured,
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
    const existing = await BusinessAnchor.findById(labAnchorId)
      .select({ labFeeSchedule: 1, name: 1, metadata: 1 })
      .lean();
    let items = Array.isArray(req.body?.items)
      ? normalizeLabFeeItems({ items: req.body.items })
      : normalizeLabFeeItems(
          existing?.labFeeSchedule?.items?.length
            ? existing.labFeeSchedule
            : req.body?.schedule || req.body || existing?.labFeeSchedule,
        );
    if (!items.length) {
      const seeded = await resolveLabFeeScheduleForSettingsFromCatalog(
        existing?.labFeeSchedule,
      );
      items = normalizeLabFeeItems(seeded);
    }
    const remakeRaw = req.body?.remake ?? req.body?.schedule?.remake;
    const remakeFallback = normalizeLabFeeRemakeSchedule(
      remakeRaw != null ? remakeRaw : existing?.labFeeSchedule,
    );
    const enabledFallback = normalizeLabFeeScheduleEnabled(
      req.body?.enabled ?? req.body?.schedule?.enabled ?? existing?.labFeeSchedule,
    );
    const legacy = legacyLabFeeScheduleFromItems(items, {
      ...normalizeLabFeeSchedule(existing?.labFeeSchedule),
      remake: remakeFallback,
      enabled: enabledFallback,
    });
    const active =
      typeof req.body?.active === "boolean"
        ? req.body.active
        : isLabFeeScheduleConfigured(existing?.labFeeSchedule);
    const updated = await BusinessAnchor.findByIdAndUpdate(
      labAnchorId,
      {
        $set: {
          labFeeSchedule: {
            ...legacy.schedule,
            remake: {
              ...remakeFallback,
              ...legacy.remake,
            },
            enabled: {
              ...enabledFallback,
              ...legacy.enabled,
            },
            items,
            active,
            updatedAt: new Date(),
          },
        },
      },
      { new: true, select: { labFeeSchedule: 1 } },
    ).lean();
    const configured = isLabFeeScheduleReadyToCharge(updated?.labFeeSchedule);
    const activeFlag = isLabFeeScheduleConfigured(updated?.labFeeSchedule);
    invalidatePracticeTransferQuoteCaches(labAnchorId);

    const labName =
      String(existing?.name || existing?.metadata?.companyName || "").trim() ||
      "기공소";
    try {
      const { added, schedule: abutsSchedule } =
        await syncNewLabFeeItemsToAbutsCatalog({
          labItems: items,
          labName,
          labAnchorId: String(labAnchorId),
        });
      if (added.length > 0) {
        emitAppEventToRoles(["admin"], "abuts-lab-fee:pending-items", {
          labAnchorId: String(labAnchorId),
          labName,
          items: added.map((item) => ({
            id: item.id,
            name: item.name,
            unit: item.unit,
            price: item.price,
          })),
          pendingCount: Number(abutsSchedule?.pendingCount || added.length),
        });
      }
    } catch (syncError) {
      console.error(
        "[labTradingPartners] sync abuts lab fee catalog failed",
        syncError,
      );
    }

    return res.json({
      success: true,
      data: {
        items: normalizeLabFeeItems(updated?.labFeeSchedule),
        schedule: normalizeLabFeeSchedule(updated?.labFeeSchedule),
        remake: normalizeLabFeeRemakeSchedule(updated?.labFeeSchedule),
        enabled: normalizeLabFeeScheduleEnabled(updated?.labFeeSchedule),
        active: activeFlag,
        configured,
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

/**
 * 치과별 기공수가 할증 배수 설정.
 * body: { practiceAnchorId, multiplier } — 1이면 할증 해제.
 */
export async function updateLabPracticeFeeMultiplier(req, res) {
  try {
    const labAnchorId = await resolveCallerLabAnchorId(req);
    if (!labAnchorId) {
      return res.status(403).json({
        success: false,
        message: "기공소 사업자만 이용할 수 있습니다.",
      });
    }
    const practiceAnchorId = String(req.body?.practiceAnchorId || "").trim();
    if (!practiceAnchorId || !Types.ObjectId.isValid(practiceAnchorId)) {
      return res.status(400).json({
        success: false,
        message: "치과 사업자 ID가 필요합니다.",
      });
    }
    const practice = await BusinessAnchor.findById(practiceAnchorId)
      .select({
        _id: 1,
        businessType: 1,
        requestorKind: 1,
        requestorCapabilities: 1,
      })
      .lean();
    if (!practice || String(practice.businessType || "") !== "requestor") {
      return res.status(404).json({
        success: false,
        message: "치과 사업자를 찾을 수 없습니다.",
      });
    }
    if (normalizeRequestorKind(practice.requestorKind) === "lab") {
      return res.status(400).json({
        success: false,
        message: "의뢰 발신자(치과)에만 할증을 적용할 수 있습니다.",
      });
    }

    const multiplier = normalizeLabFeeMultiplier(req.body?.multiplier);
    const lab = await BusinessAnchor.findById(labAnchorId)
      .select({ labPracticeFeeMultipliers: 1 })
      .lean();
    const nextList = upsertLabPracticeFeeMultiplierList(
      lab?.labPracticeFeeMultipliers,
      practiceAnchorId,
      multiplier,
    ).map((row) => ({
      practiceAnchorId: new Types.ObjectId(String(row.practiceAnchorId)),
      multiplier: row.multiplier,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
      history: (Array.isArray(row.history) ? row.history : []).map((h) => ({
        multiplier: normalizeLabFeeMultiplier(h.multiplier),
        at: h.at ? new Date(h.at) : new Date(),
      })),
    }));

    await BusinessAnchor.findByIdAndUpdate(labAnchorId, {
      $set: { labPracticeFeeMultipliers: nextList },
    });
    invalidatePracticeTransferQuoteCaches(labAnchorId);
    void emitLabFeeMultiplierUpdatedToPractice({
      practiceAnchorId,
      labAnchorId,
      labFeeMultiplier: multiplier,
    });

    return res.json({
      success: true,
      data: {
        practiceAnchorId,
        labFeeMultiplier: multiplier,
      },
    });
  } catch (e) {
    console.error("[labTradingPartners] updateLabPracticeFeeMultiplier error", e);
    return res.status(500).json({
      success: false,
      message: "기공수가 할증을 저장하지 못했습니다.",
    });
  }
}

export { activateLabTradingPartnerInvite };
