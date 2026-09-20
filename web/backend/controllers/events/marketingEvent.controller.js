// related files:
// - web/backend/models/marketingEvent.model.js
// - web/backend/models/marketingEventApplication.model.js
// - web/backend/services/kakaoPlaceSearch.service.js
// - web/backend/modules/events/event.routes.js
// - web/backend/modules/admin/admin.routes.js
import MarketingEvent from "../../models/marketingEvent.model.js";
import MarketingEventApplication from "../../models/marketingEventApplication.model.js";
import { searchKakaoPlaces } from "../../services/kakaoPlaceSearch.service.js";

const SIMPLEWAY_SAMPLE_SLUG = "simpleway-sample-kit";

const SIMPLEWAY_DEALER_HELP =
  "거래하시는 지역 재료상을 통해 샘플을 잘 쓰실 수 있도록 안내드립니다. 재료상명·대표명·전화번호를 적어 주세요.";

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

function toApplicationRow(doc) {
  return {
    id: String(doc._id),
    eventId: String(doc.eventId),
    eventSlug: doc.eventSlug,
    practice: doc.practice || {},
    directorName: doc.directorName || "",
    dealer: doc.dealer || {},
    applicantPhone: doc.applicantPhone || "",
    applicantEmail: doc.applicantEmail || "",
    memo: doc.memo || "",
    status: doc.status,
    adminNote: doc.adminNote || "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** 첫 이벤트(심플웨이 신제품 샘플 배포)를 DB에 보장한다. */
export async function ensureDefaultMarketingEvents() {
  const existing = await MarketingEvent.findOne({
    slug: SIMPLEWAY_SAMPLE_SLUG,
  }).lean();
  if (existing) return existing;

  try {
    return await MarketingEvent.create({
      slug: SIMPLEWAY_SAMPLE_SLUG,
      title: "심플웨이 신제품 샘플 배포 행사",
      summary:
        "심플웨이 신제품 샘플을 치과에 배포하는 행사입니다. 거래 지역 재료상 연락처를 함께 남겨 주세요.",
      description: [
        "심플웨이 신제품 샘플을 원장님께 전달해 드립니다.",
        "",
        "신청 시 치과·원장명과 함께, 거래하시는 지역 재료상(재료상명·대표명·전화번호)을 기입해 주세요.",
        SIMPLEWAY_DEALER_HELP,
      ].join("\n"),
      status: "open",
      sortOrder: 1,
      startsAt: new Date(),
      formConfig: {
        requirePractice: true,
        requireDealer: true,
        dealerHelpText: SIMPLEWAY_DEALER_HELP,
      },
    });
  } catch (err) {
    // 동시 생성 race → 재조회
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

/** GET /api/events/:slug */
export async function getPublicEvent(req, res) {
  try {
    await ensureDefaultMarketingEvents();
    const slug = trimStr(req.params.slug, 80).toLowerCase();
    const doc = await MarketingEvent.findOne({ slug, status: "open" }).lean();
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "이벤트를 찾을 수 없거나 신청이 마감되었습니다.",
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

/** POST /api/events/:slug/applications */
export async function applyToEvent(req, res) {
  try {
    await ensureDefaultMarketingEvents();
    const slug = trimStr(req.params.slug, 80).toLowerCase();
    const event = await MarketingEvent.findOne({ slug }).lean();
    if (!event || event.status !== "open") {
      return res.status(404).json({
        success: false,
        message: "이벤트를 찾을 수 없거나 신청이 마감되었습니다.",
      });
    }

    const body = req.body || {};
    const practice = normalizePlace(body.practice);
    const dealer = normalizePlace(body.dealer);
    const directorName = trimStr(body.directorName, 80);
    const applicantPhone = trimStr(
      body.applicantPhone || practice.phone,
      40,
    );
    const applicantEmail = trimStr(body.applicantEmail, 120);
    const memo = trimStr(body.memo, 1000);

    const needPractice = event.formConfig?.requirePractice !== false;
    const needDealer = Boolean(event.formConfig?.requireDealer);

    if (needPractice) {
      if (!practice.name) {
        return res.status(400).json({
          success: false,
          message: "치과명을 입력해 주세요.",
        });
      }
      if (!directorName) {
        return res.status(400).json({
          success: false,
          message: "원장명을 입력해 주세요.",
        });
      }
    }

    if (needDealer) {
      if (!dealer.name) {
        return res.status(400).json({
          success: false,
          message: "거래 지역 재료상명을 입력해 주세요.",
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
          message: "재료상 전화번호를 입력해 주세요.",
        });
      }
    }

    // 동일 치과명+원장 중복 신청 가드(같은 이벤트)
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
      practice,
      directorName,
      dealer,
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
    const items = await MarketingEventApplication.find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    return res.json({
      success: true,
      data: {
        event: toAdminEvent(event),
        items: items.map(toApplicationRow),
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
