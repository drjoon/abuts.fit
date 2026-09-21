// related files:
// - web/backend/models/marketingEvent.model.js
// - web/backend/models/marketingEventApplication.model.js
// - web/backend/services/kakaoPlaceSearch.service.js
// - web/backend/modules/events/event.routes.js
// - web/backend/modules/admin/admin.routes.js
import MarketingEvent from "../../models/marketingEvent.model.js";
import MarketingEventApplication from "../../models/marketingEventApplication.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { searchKakaoPlaces } from "../../services/kakaoPlaceSearch.service.js";

const SIMPLEWAY_SAMPLE_SLUG = "simpleway-gribo";
const SIMPLEWAY_SAMPLE_SLUG_LEGACY = "simpleway-sample-kit";

const SIMPLEWAY_DEALER_HELP =
  "친한 로컬 재료상 사장님을 소개해주세요. 그 분께 지역 영업권을 드립니다. (옵션)";

/** 공개 카피 SSOT — 샘플 배포·피드백 조건부 편익 문구 금지(출시 행사·제품 소개) */
const SIMPLEWAY_EVENT_COPY = {
  title: "심플웨이 신제품 - 그리보(Gribo) 출시 행사",
  summary:
    "그리보 힐링H·어벗H · 커스텀어벗 · 드라이버 제품 소개. 화·수 이틀간 신청 접수.",
  description: [
    "소개 제품",
    "· 그리보 힐링H",
    "· 그리보 어벗H",
    "· 그리보 커스텀어벗",
    "· 그리보 드라이버",
    "",
    "신청 기간: 화요일 · 수요일 (이틀)",
    "",
    "신청 후 영업 담당자가 방문해 제품·사용 방법을 안내합니다.",
    "친한 로컬 재료상 사장님을 소개해 주시면 그 분께 지역 영업권을 드립니다. (옵션)",
    "",
    "추가 안내",
    "· 거래 기공소에 그리보 힐링 스캔 라이브러리 설치 안내 (그리보 어벗H·그리보 커스텀어벗)",
    "· 구강 스캐너 사용 치과에는 스캔바 제품 소개",
  ].join("\n"),
};

function trimStr(v, max = 200) {
  return String(v || "")
    .trim()
    .slice(0, max);
}

function normalizePlace(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const lat = Number(src.lat);
  const lng = Number(src.lng);
  return {
    name: trimStr(src.name, 120),
    representativeName: trimStr(src.representativeName, 80),
    phone: trimStr(src.phone, 40),
    address: trimStr(src.address, 240),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

function normalizeMatchKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/주식회사|유한회사|\(주\)|\(유\)/g, "")
    .replace(/치과의원|치과병원|치과$/g, "");
}

function normalizePhoneDigits(value) {
  return String(value || "").replace(/\D+/g, "");
}

function dealerHasAny(dealer) {
  return Boolean(
    dealer?.name || dealer?.representativeName || dealer?.phone,
  );
}

function toPublicEvent(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    slug: doc.slug,
    title: doc.title,
    summary: doc.summary || "",
    description: doc.description || "",
    status: doc.status,
    startsAt: doc.startsAt || null,
    endsAt: doc.endsAt || null,
    coverImageUrl: doc.coverImageUrl || "",
    formConfig: {
      requirePractice: doc.formConfig?.requirePractice !== false,
      requireDealer: Boolean(doc.formConfig?.requireDealer),
      dealerHelpText: doc.formConfig?.dealerHelpText || "",
    },
  };
}

function toAdminEvent(doc, applicationCount = 0) {
  return {
    ...toPublicEvent(doc),
    sortOrder: doc.sortOrder || 0,
    applicationCount,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toApplicationRow(doc, extras = {}) {
  return {
    id: String(doc._id),
    eventId: String(doc.eventId),
    eventSlug: doc.eventSlug,
    practice: doc.practice || {},
    directorName: doc.directorName || "",
    dealer: doc.dealer || {},
    usesOralScan: Boolean(doc.usesOralScan),
    applicantPhone: doc.applicantPhone || "",
    applicantEmail: doc.applicantEmail || "",
    memo: doc.memo || "",
    status: doc.status,
    adminNote: doc.adminNote || "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    practiceRegistered: Boolean(extras.practiceRegistered),
    dealerRegistered: Boolean(extras.dealerRegistered),
  };
}

async function matchMembershipForApplications(apps) {
  const practiceKeys = new Set();
  const practicePhones = new Set();
  const dealerKeys = new Set();
  const dealerPhones = new Set();

  for (const app of apps) {
    const pKey = normalizeMatchKey(app.practice?.name);
    if (pKey) practiceKeys.add(pKey);
    const pPhone = normalizePhoneDigits(app.practice?.phone || app.applicantPhone);
    if (pPhone.length >= 8) practicePhones.add(pPhone);
    const dKey = normalizeMatchKey(app.dealer?.name);
    if (dKey) dealerKeys.add(dKey);
    const dPhone = normalizePhoneDigits(app.dealer?.phone);
    if (dPhone.length >= 8) dealerPhones.add(dPhone);
  }

  if (
    practiceKeys.size === 0 &&
    practicePhones.size === 0 &&
    dealerKeys.size === 0 &&
    dealerPhones.size === 0
  ) {
    return {
      byPractice: new Map(),
      byDealer: new Map(),
    };
  }

  const nameCandidates = [
    ...new Set(
      apps
        .flatMap((app) => [app.practice?.name, app.dealer?.name])
        .map((n) => trimStr(n, 120))
        .filter(Boolean),
    ),
  ];
  const phoneCandidates = [
    ...new Set(
      apps
        .flatMap((app) => [
          app.practice?.phone,
          app.applicantPhone,
          app.dealer?.phone,
        ])
        .map((p) => normalizePhoneDigits(p))
        .filter((p) => p.length >= 8),
    ),
  ];

  const or = [];
  if (nameCandidates.length) {
    or.push({ name: { $in: nameCandidates } });
    for (const name of nameCandidates.slice(0, 40)) {
      const key = normalizeMatchKey(name);
      if (key.length < 2) continue;
      const fragment = key.slice(0, Math.min(8, key.length));
      or.push({
        name: new RegExp(
          fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "i",
        ),
      });
    }
  }
  if (phoneCandidates.length) {
    for (const phone of phoneCandidates.slice(0, 40)) {
      const tail = phone.slice(-8);
      or.push({
        "metadata.phoneNumber": new RegExp(
          tail.split("").join("\\D*"),
        ),
      });
    }
  }

  const anchors = or.length
    ? await BusinessAnchor.find({
        status: { $nin: ["merged", "inactive"] },
        $or: or,
      })
        .select({
          name: 1,
          metadata: 1,
          requestorCapabilities: 1,
          businessType: 1,
        })
        .limit(400)
        .lean()
    : [];

  const byPractice = new Map();
  const byDealer = new Map();

  for (const anchor of anchors) {
    const key = normalizeMatchKey(anchor.name);
    const phone = normalizePhoneDigits(anchor.metadata?.phoneNumber);
    const caps = anchor.requestorCapabilities || {};
    const isPracticeLike =
      caps.practice === true ||
      String(anchor.businessType || "") === "requestor" ||
      String(anchor.businessType || "") === "practice";

    if (key && practiceKeys.has(key) && isPracticeLike) {
      byPractice.set(key, true);
    }
    if (phone && practicePhones.has(phone) && isPracticeLike) {
      byPractice.set(`phone:${phone}`, true);
    }
    if (key && dealerKeys.has(key)) {
      byDealer.set(key, true);
    }
    if (phone && dealerPhones.has(phone)) {
      byDealer.set(`phone:${phone}`, true);
    }
  }

  return { byPractice, byDealer };
}

function isPracticeRegistered(app, maps) {
  const key = normalizeMatchKey(app.practice?.name);
  if (key && maps.byPractice.has(key)) return true;
  const phone = normalizePhoneDigits(app.practice?.phone || app.applicantPhone);
  if (phone.length >= 8 && maps.byPractice.has(`phone:${phone}`)) return true;
  return false;
}

function isDealerRegistered(app, maps) {
  if (!dealerHasAny(app.dealer)) return false;
  const key = normalizeMatchKey(app.dealer?.name);
  if (key && maps.byDealer.has(key)) return true;
  const phone = normalizePhoneDigits(app.dealer?.phone);
  if (phone.length >= 8 && maps.byDealer.has(`phone:${phone}`)) return true;
  return false;
}

function buildApplicationStats(items) {
  const total = items.length;
  const withDealer = items.filter((it) => dealerHasAny(it.dealer)).length;
  const oralScanYes = items.filter((it) => it.usesOralScan).length;
  const practiceRegistered = items.filter((it) => it.practiceRegistered).length;
  const dealerRegistered = items.filter((it) => it.dealerRegistered).length;
  const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
  return {
    total,
    withDealer,
    oralScanYes,
    oralScanRate: pct(oralScanYes, total),
    practiceRegistered,
    practiceSignupRate: pct(practiceRegistered, total),
    dealerRegistered,
    dealerSignupRate: pct(dealerRegistered, withDealer),
  };
}

/** 첫 이벤트(그리보 출시 행사)를 DB에 보장·카피 동기화한다. */
export async function ensureDefaultMarketingEvents() {
  let existing = await MarketingEvent.findOne({
    slug: SIMPLEWAY_SAMPLE_SLUG,
  });

  // 구 slug → 신규 slug 이전 (신청 이력 eventSlug도 맞춤)
  if (!existing) {
    const legacy = await MarketingEvent.findOne({
      slug: SIMPLEWAY_SAMPLE_SLUG_LEGACY,
    });
    if (legacy) {
      legacy.slug = SIMPLEWAY_SAMPLE_SLUG;
      await legacy.save();
      await MarketingEventApplication.updateMany(
        { eventId: legacy._id },
        { $set: { eventSlug: SIMPLEWAY_SAMPLE_SLUG } },
      );
      existing = legacy;
    }
  } else {
    // 신규 slug가 이미 있으면 구 slug·구 제목 잔여 문서·신청 삭제
    const legacyDocs = await MarketingEvent.find({
      $or: [
        { slug: SIMPLEWAY_SAMPLE_SLUG_LEGACY },
        { title: "심플웨이 신제품 샘플 배포 행사" },
        { title: "그리보 신제품 샘플 배포 행사" },
      ],
    })
      .select({ _id: 1 })
      .lean();
    const legacyIds = legacyDocs
      .map((d) => d._id)
      .filter((id) => String(id) !== String(existing._id));
    if (legacyIds.length) {
      await MarketingEventApplication.deleteMany({
        eventId: { $in: legacyIds },
      });
      await MarketingEvent.deleteMany({ _id: { $in: legacyIds } });
    }
  }

  if (existing) {
    let dirty = false;
    if (existing.title !== SIMPLEWAY_EVENT_COPY.title) {
      existing.title = SIMPLEWAY_EVENT_COPY.title;
      dirty = true;
    }
    if (existing.summary !== SIMPLEWAY_EVENT_COPY.summary) {
      existing.summary = SIMPLEWAY_EVENT_COPY.summary;
      dirty = true;
    }
    if (existing.description !== SIMPLEWAY_EVENT_COPY.description) {
      existing.description = SIMPLEWAY_EVENT_COPY.description;
      dirty = true;
    }
    if (!existing.formConfig) existing.formConfig = {};
    if (existing.formConfig.requirePractice !== true) {
      existing.formConfig.requirePractice = true;
      dirty = true;
    }
    if (existing.formConfig.requireDealer !== false) {
      existing.formConfig.requireDealer = false;
      dirty = true;
    }
    if (existing.formConfig.dealerHelpText !== SIMPLEWAY_DEALER_HELP) {
      existing.formConfig.dealerHelpText = SIMPLEWAY_DEALER_HELP;
      dirty = true;
    }
    if (dirty) await existing.save();
    return existing.toObject();
  }

  try {
    const created = await MarketingEvent.create({
      slug: SIMPLEWAY_SAMPLE_SLUG,
      ...SIMPLEWAY_EVENT_COPY,
      status: "draft",
      sortOrder: 1,
      startsAt: new Date(),
      formConfig: {
        requirePractice: true,
        requireDealer: false,
        dealerHelpText: SIMPLEWAY_DEALER_HELP,
      },
    });
    return created.toObject();
  } catch (err) {
    if (err?.code === 11000) {
      return MarketingEvent.findOne({ slug: SIMPLEWAY_SAMPLE_SLUG }).lean();
    }
    throw err;
  }
}

/** GET /api/events — 공개 목록(open만) */
export async function listPublicEvents(req, res) {
  try {
    await ensureDefaultMarketingEvents();
    const items = await MarketingEvent.find({ status: "open" })
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();
    return res.json({
      success: true,
      data: { items: items.map(toPublicEvent) },
    });
  } catch (error) {
    console.error("[events.listPublic]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "이벤트 목록 조회에 실패했습니다.",
    });
  }
}

/** GET /api/events/:slug — 초안/마감도 미리보기 가능 */
export async function getPublicEvent(req, res) {
  try {
    await ensureDefaultMarketingEvents();
    const slug = trimStr(req.params.slug, 80).toLowerCase();
    const doc = await MarketingEvent.findOne({ slug }).lean();
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "이벤트를 찾을 수 없습니다.",
      });
    }
    return res.json({ success: true, data: toPublicEvent(doc) });
  } catch (error) {
    console.error("[events.getPublic]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "이벤트 조회에 실패했습니다.",
    });
  }
}

/** GET /api/events/places/suggest?q=&kind=practice|dealer */
export async function suggestEventPlaces(req, res) {
  try {
    const q = trimStr(req.query.q, 80);
    const kindRaw = trimStr(req.query.kind, 20).toLowerCase();
    const mode = kindRaw === "dealer" ? "dealer" : "practice";
    if (q.length < 2) {
      return res.json({ success: true, data: { items: [] } });
    }
    const result = await searchKakaoPlaces(q, { mode, limit: 20 });
    return res.json({
      success: true,
      data: {
        items: result.items,
        authError: Boolean(result.authError),
        keyMissing: Boolean(result.keyMissing),
      },
    });
  } catch (error) {
    console.error("[events.suggestPlaces]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "장소 제안에 실패했습니다.",
    });
  }
}

/** POST /api/events/:slug/applications — draft|open 접수, closed만 거절 */
export async function applyToEvent(req, res) {
  try {
    await ensureDefaultMarketingEvents();
    const slug = trimStr(req.params.slug, 80).toLowerCase();
    const event = await MarketingEvent.findOne({ slug }).lean();
    if (!event || event.status === "closed") {
      return res.status(404).json({
        success: false,
        message: "이벤트를 찾을 수 없거나 신청이 마감되었습니다.",
      });
    }

    const body = req.body || {};
    const authUser = req.user || null;
    const authPp =
      authUser?.practiceProfile && typeof authUser.practiceProfile === "object"
        ? authUser.practiceProfile
        : {};

    let practice = normalizePlace(body.practice);
    let directorName = trimStr(body.directorName, 80);
    let applicantPhone = trimStr(
      body.applicantPhone || practice.phone,
      40,
    );
    const dealer = normalizePlace(body.dealer);
    const applicantEmail = trimStr(
      body.applicantEmail || authUser?.email || "",
      120,
    );
    const memo = trimStr(body.memo, 1000);
    if (typeof body.usesOralScan !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "구강 스캔 사용 여부를 선택해 주세요.",
      });
    }
    const usesOralScan = body.usesOralScan;

    // 로그인 치과: 본문 미입력이면 프로필·계정으로 채움
    if (authUser) {
      const profileName = trimStr(
        authPp.clinicName || authUser.business || "",
        120,
      );
      const profileDirector = trimStr(
        authPp.directorName || authPp.staffName || authUser.name || "",
        80,
      );
      const profilePhone = trimStr(
        authPp.phone || authPp.clinicPhone || authUser.phoneNumber || "",
        40,
      );
      const profileAddress = trimStr(
        [authPp.address, authPp.addressDetail].filter(Boolean).join(" "),
        240,
      );
      if (!practice.name && profileName) {
        practice = {
          ...practice,
          name: profileName,
        };
      }
      if (!practice.representativeName && profileDirector) {
        practice = {
          ...practice,
          representativeName: profileDirector,
        };
      }
      if (!practice.phone && profilePhone) {
        practice = { ...practice, phone: profilePhone };
      }
      if (!practice.address && profileAddress) {
        practice = { ...practice, address: profileAddress };
      }
      if (!directorName && profileDirector) directorName = profileDirector;
      if (!applicantPhone && profilePhone) applicantPhone = profilePhone;
    }

    const needPractice = event.formConfig?.requirePractice !== false;
    const needDealer = Boolean(event.formConfig?.requireDealer);

    if (needPractice) {
      if (!practice.name) {
        return res.status(400).json({
          success: false,
          message: "치과명을 입력해 주세요.",
        });
      }
      // 로그인 신청: 원장명 미기재 시 담당자/계정명으로 대체한 뒤에도 없으면 치과명 사용
      if (!directorName && authUser) {
        directorName = trimStr(practice.name, 80);
      }
      if (!directorName) {
        return res.status(400).json({
          success: false,
          message: "원장명을 입력해 주세요.",
        });
      }
    }

    if (needDealer || dealerHasAny(dealer)) {
      if (!dealer.name) {
        return res.status(400).json({
          success: false,
          message: "재료상 회사명을 입력해 주세요.",
        });
      }
      if (!dealer.representativeName) {
        return res.status(400).json({
          success: false,
          message: "재료상 대표명을 입력해 주세요.",
        });
      }
      if (!dealer.phone) {
        return res.status(400).json({
          success: false,
          message: "재료상 휴대전화를 입력해 주세요.",
        });
      }
    }

    const applicantUserId = authUser?._id || null;

    if (applicantUserId) {
      const dupByUser = await MarketingEventApplication.findOne({
        eventId: event._id,
        applicantUserId,
        status: { $ne: "rejected" },
      })
        .select({ _id: 1 })
        .lean();
      if (dupByUser) {
        return res.status(409).json({
          success: false,
          message: "이미 신청하신 내역이 있습니다. 영업팀에 문의해 주세요.",
        });
      }
    }

    const dup = await MarketingEventApplication.findOne({
      eventId: event._id,
      "practice.name": practice.name,
      directorName,
      status: { $ne: "rejected" },
    })
      .select({ _id: 1 })
      .lean();
    if (dup) {
      return res.status(409).json({
        success: false,
        message: "이미 신청하신 내역이 있습니다. 영업팀에 문의해 주세요.",
      });
    }

    const created = await MarketingEventApplication.create({
      eventId: event._id,
      eventSlug: event.slug,
      applicantUserId,
      practice,
      directorName,
      dealer: dealerHasAny(dealer) ? dealer : normalizePlace({}),
      usesOralScan,
      applicantPhone,
      applicantEmail,
      memo,
      status: "received",
    });

    return res.status(201).json({
      success: true,
      data: toApplicationRow(created),
      message: "신청이 접수되었습니다.",
    });
  } catch (error) {
    console.error("[events.apply]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "신청에 실패했습니다.",
    });
  }
}

/** GET /api/events/:slug/my-application — 로그인 사용자 신청 여부 */
export async function getMyEventApplication(req, res) {
  try {
    await ensureDefaultMarketingEvents();
    const slug = trimStr(req.params.slug, 80).toLowerCase();
    const event = await MarketingEvent.findOne({ slug }).lean();
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "이벤트를 찾을 수 없습니다.",
      });
    }

    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "로그인이 필요합니다.",
      });
    }

    let app = await MarketingEventApplication.findOne({
      eventId: event._id,
      applicantUserId: userId,
      status: { $ne: "rejected" },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!app) {
      const pp =
        req.user?.practiceProfile &&
        typeof req.user.practiceProfile === "object"
          ? req.user.practiceProfile
          : {};
      const practiceName = trimStr(pp.clinicName || req.user.business || "", 120);
      const directorName = trimStr(pp.directorName, 80);
      if (practiceName && directorName) {
        app = await MarketingEventApplication.findOne({
          eventId: event._id,
          "practice.name": practiceName,
          directorName,
          status: { $ne: "rejected" },
        })
          .sort({ createdAt: -1 })
          .lean();
      }
    }

    return res.json({
      success: true,
      data: {
        applied: Boolean(app),
        application: app ? toApplicationRow(app) : null,
        event: toPublicEvent(event),
      },
    });
  } catch (error) {
    console.error("[events.getMyApplication]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "신청 조회에 실패했습니다.",
    });
  }
}

/** GET /api/admin/events */
export async function adminListEvents(req, res) {
  try {
    await ensureDefaultMarketingEvents();
    const items = await MarketingEvent.find({})
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();
    const ids = items.map((it) => it._id);
    const counts = await MarketingEventApplication.aggregate([
      { $match: { eventId: { $in: ids } } },
      { $group: { _id: "$eventId", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
    return res.json({
      success: true,
      data: {
        items: items.map((it) =>
          toAdminEvent(it, countMap.get(String(it._id)) || 0),
        ),
      },
    });
  } catch (error) {
    console.error("[events.adminList]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "이벤트 목록 조회에 실패했습니다.",
    });
  }
}

/** PATCH /api/admin/events/:id */
export async function adminUpdateEvent(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    const event = await MarketingEvent.findById(id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "이벤트를 찾을 수 없습니다.",
      });
    }
    const body = req.body || {};
    if (body.title != null) event.title = trimStr(body.title, 160);
    if (body.summary != null) event.summary = trimStr(body.summary, 400);
    if (body.description != null)
      event.description = trimStr(body.description, 4000);
    if (body.status != null && ["draft", "open", "closed"].includes(body.status)) {
      event.status = body.status;
    }
    if (body.coverImageUrl != null)
      event.coverImageUrl = trimStr(body.coverImageUrl, 500);
    if (body.sortOrder != null && Number.isFinite(Number(body.sortOrder))) {
      event.sortOrder = Number(body.sortOrder);
    }
    if (body.formConfig && typeof body.formConfig === "object") {
      if (body.formConfig.requirePractice != null) {
        event.formConfig.requirePractice = Boolean(
          body.formConfig.requirePractice,
        );
      }
      if (body.formConfig.requireDealer != null) {
        event.formConfig.requireDealer = Boolean(body.formConfig.requireDealer);
      }
      if (body.formConfig.dealerHelpText != null) {
        event.formConfig.dealerHelpText = trimStr(
          body.formConfig.dealerHelpText,
          500,
        );
      }
    }
    await event.save();
    return res.json({ success: true, data: toAdminEvent(event.toObject()) });
  } catch (error) {
    console.error("[events.adminUpdate]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "이벤트 수정에 실패했습니다.",
    });
  }
}

/** GET /api/admin/events/:id/applications */
export async function adminListApplications(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    const event = await MarketingEvent.findById(id).lean();
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "이벤트를 찾을 수 없습니다.",
      });
    }
    const status = trimStr(req.query.status, 20);
    const q = trimStr(req.query.q, 80);
    const filter = { eventId: event._id };
    if (status && ["received", "reviewed", "fulfilled", "rejected"].includes(status)) {
      filter.status = status;
    }
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { "practice.name": re },
        { directorName: re },
        { "dealer.name": re },
        { "dealer.representativeName": re },
        { "dealer.phone": re },
        { applicantPhone: re },
      ];
    }
    const rawItems = await MarketingEventApplication.find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    const maps = await matchMembershipForApplications(rawItems);
    const items = rawItems.map((doc) =>
      toApplicationRow(doc, {
        practiceRegistered: isPracticeRegistered(doc, maps),
        dealerRegistered: isDealerRegistered(doc, maps),
      }),
    );

    return res.json({
      success: true,
      data: {
        event: toAdminEvent(event),
        items,
        stats: buildApplicationStats(items),
      },
    });
  } catch (error) {
    console.error("[events.adminListApplications]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "신청 목록 조회에 실패했습니다.",
    });
  }
}

/** PATCH /api/admin/events/applications/:applicationId */
export async function adminUpdateApplication(req, res) {
  try {
    const id = String(req.params.applicationId || "").trim();
    const app = await MarketingEventApplication.findById(id);
    if (!app) {
      return res.status(404).json({
        success: false,
        message: "신청을 찾을 수 없습니다.",
      });
    }
    const body = req.body || {};
    if (
      body.status != null &&
      ["received", "reviewed", "fulfilled", "rejected"].includes(body.status)
    ) {
      app.status = body.status;
    }
    if (body.adminNote != null) app.adminNote = trimStr(body.adminNote, 1000);
    await app.save();
    return res.json({ success: true, data: toApplicationRow(app.toObject()) });
  } catch (error) {
    console.error("[events.adminUpdateApplication]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "신청 수정에 실패했습니다.",
    });
  }
}
