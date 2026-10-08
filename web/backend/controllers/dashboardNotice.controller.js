// related files:
// - web/backend/models/dashboardNotice.model.js
// - web/backend/utils/dashboardNotice.js
// - web/backend/modules/admin/admin.routes.js
// - web/backend/modules/notices/notice.routes.js
// - web/frontend/src/pages/admin/dashboard/NoticeAdminCard.tsx
// - web/frontend/src/shared/notices/DashboardNoticeAlert.tsx
import { randomUUID } from "crypto";
import { extname } from "path";
import DashboardNotice from "../models/dashboardNotice.model.js";
import {
  NOTICE_AUDIENCES,
  isNoticeWindowOpen,
  normalizeNoticeAudiences,
  resolveNoticeAudiencesForUser,
} from "../utils/dashboardNotice.js";
import { deleteFileFromS3, getSignedUrl, putObjectToS3 } from "../utils/s3.utils.js";

const SHIP_HOLIDAY_NOTICE_CODE = "ship-holiday-2026-10-09";
const SHIP_HOLIDAY_COPY =
  "10월 9일 금요일은 택배사 휴무이므로, 10월 6일 화요일에 발송합니다.";
/** 선발송일(10/6) 종료 시각. 이후에는 안내가 필요 없다. */
const SHIP_HOLIDAY_ENDS_AT = new Date("2026-10-06T23:59:59.999+09:00");
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

let seedPromise = null;

const LEGACY_ALL_AUDIENCES = [
  "practice",
  "lab",
  "dealer",
  "salesTeam",
  "labHq",
];

/** 배송 휴무 안내. 이미 있으면 본문은 덮지 않고, 종료일·제조사 대상만 맞춘다. */
export function ensureDashboardNoticeSeed() {
  if (!seedPromise) {
    seedPromise = (async () => {
      await DashboardNotice.updateOne(
        { code: SHIP_HOLIDAY_NOTICE_CODE },
        {
          $setOnInsert: {
            code: SHIP_HOLIDAY_NOTICE_CODE,
            title: SHIP_HOLIDAY_COPY,
            body: SHIP_HOLIDAY_COPY,
            audiences: [...NOTICE_AUDIENCES],
            images: [],
            published: true,
            startsAt: null,
            endsAt: SHIP_HOLIDAY_ENDS_AT,
          },
        },
        { upsert: true },
      );
      await DashboardNotice.updateOne(
        {
          code: SHIP_HOLIDAY_NOTICE_CODE,
          endsAt: { $gt: SHIP_HOLIDAY_ENDS_AT },
        },
        { $set: { endsAt: SHIP_HOLIDAY_ENDS_AT } },
      );
      // 예전「전체 대상」공지에 제조사를 넣는다.
      await DashboardNotice.updateMany(
        {
          audiences: {
            $all: LEGACY_ALL_AUDIENCES,
            $nin: ["manufacturer"],
          },
        },
        { $addToSet: { audiences: "manufacturer" } },
      );
    })().catch((error) => {
      seedPromise = null;
      if (Number(error?.code) === 11000) return null;
      throw error;
    });
  }
  return seedPromise;
}

function parseOptionalDate(raw) {
  if (raw == null || raw === "") return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { invalid: true };
  return date;
}

/** 고른 시각의 KST 날짜 23:59:59. 종료는 날짜만 받고 그날 끝에 내린다. */
function endOfKstDay(date) {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const end = new Date(`${ymd}T23:59:59+09:00`);
  if (Number.isNaN(end.getTime())) return { invalid: true };
  return end;
}

async function signImages(images) {
  const rows = Array.isArray(images) ? images : [];
  const signed = [];
  for (const image of rows) {
    const key = String(image?.key || "").trim();
    if (!key) continue;
    let url = "";
    try {
      url = await getSignedUrl(key, 3600);
    } catch (error) {
      console.error("[dashboardNotice] signed url", error?.message || error);
    }
    signed.push({
      key,
      fileName: String(image.fileName || ""),
      contentType: String(image.contentType || ""),
      url,
    });
  }
  return signed;
}

async function toNoticeDto(doc, { includeKeys = false } = {}) {
  const images = await signImages(doc.images);
  return {
    id: String(doc._id),
    code: String(doc.code || ""),
    title: String(doc.title || ""),
    body: String(doc.body || ""),
    audiences: normalizeNoticeAudiences(doc.audiences),
    images: includeKeys
      ? images
      : images.map(({ fileName, contentType, url }) => ({
          fileName,
          contentType,
          url,
        })),
    published: doc.published !== false,
    startsAt: doc.startsAt ? new Date(doc.startsAt).toISOString() : null,
    endsAt: doc.endsAt ? new Date(doc.endsAt).toISOString() : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

function readNoticeFields(body) {
  const title = String(body?.title || "").trim();
  const text = String(body?.body || "").trim();
  const audiences = normalizeNoticeAudiences(body?.audiences);
  if (!title) return { error: "제목을 입력해 주세요." };
  if (title.length > 200) return { error: "제목은 200자까지 입력할 수 있습니다." };
  if (!text) return { error: "내용을 입력해 주세요." };
  if (text.length > 4000) return { error: "내용은 4000자까지 입력할 수 있습니다." };
  if (!audiences.length) return { error: "대상을 한 곳 이상 선택해 주세요." };
  const startsAt = parseOptionalDate(body?.startsAt);
  const endsAtRaw = parseOptionalDate(body?.endsAt);
  const endsAt = endsAtRaw && !endsAtRaw.invalid ? endOfKstDay(endsAtRaw) : endsAtRaw;
  if (startsAt?.invalid || endsAt?.invalid) {
    return { error: "게시 기간이 올바르지 않습니다." };
  }
  if (startsAt && endsAt && startsAt > endsAt) {
    return { error: "게시 종료는 시작보다 뒤여야 합니다." };
  }
  return {
    value: {
      title,
      body: text,
      audiences,
      published: body?.published !== false && body?.published !== "false",
      startsAt,
      endsAt,
    },
  };
}

export async function getActiveDashboardNotices(req, res) {
  try {
    await ensureDashboardNoticeSeed();
    const audiences = resolveNoticeAudiencesForUser(req.user);
    if (!audiences.length) {
      return res.status(200).json({ success: true, data: { items: [] } });
    }
    const now = new Date();
    const rows = await DashboardNotice.find({
      published: true,
      audiences: { $in: audiences },
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    const items = [];
    for (const row of rows) {
      if (!isNoticeWindowOpen(row, now)) continue;
      items.push(await toNoticeDto(row));
    }
    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    console.error("[dashboardNotice] active", error);
    return res.status(500).json({
      success: false,
      message: "공지를 불러오지 못했습니다.",
    });
  }
}

export async function listAdminDashboardNotices(_req, res) {
  try {
    await ensureDashboardNoticeSeed();
    const rows = await DashboardNotice.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    const items = [];
    for (const row of rows) {
      items.push(await toNoticeDto(row, { includeKeys: true }));
    }
    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    console.error("[dashboardNotice] admin list", error);
    return res.status(500).json({
      success: false,
      message: "공지 목록을 불러오지 못했습니다.",
    });
  }
}

export async function createAdminDashboardNotice(req, res) {
  try {
    const parsed = readNoticeFields(req.body);
    if (parsed.error) {
      return res.status(400).json({ success: false, message: parsed.error });
    }
    const created = await DashboardNotice.create({
      ...parsed.value,
      createdBy: req.user?._id,
      updatedBy: req.user?._id,
    });
    return res.status(201).json({
      success: true,
      data: await toNoticeDto(created.toObject(), { includeKeys: true }),
    });
  } catch (error) {
    console.error("[dashboardNotice] create", error);
    return res.status(500).json({
      success: false,
      message: "공지를 저장하지 못했습니다.",
    });
  }
}

export async function updateAdminDashboardNotice(req, res) {
  try {
    const parsed = readNoticeFields(req.body);
    if (parsed.error) {
      return res.status(400).json({ success: false, message: parsed.error });
    }
    const updated = await DashboardNotice.findByIdAndUpdate(
      req.params.id,
      { $set: { ...parsed.value, updatedBy: req.user?._id } },
      { new: true },
    ).lean();
    if (!updated) {
      return res.status(404).json({ success: false, message: "공지를 찾을 수 없습니다." });
    }
    return res.status(200).json({
      success: true,
      data: await toNoticeDto(updated, { includeKeys: true }),
    });
  } catch (error) {
    console.error("[dashboardNotice] update", error);
    return res.status(500).json({
      success: false,
      message: "공지를 저장하지 못했습니다.",
    });
  }
}

export async function deleteAdminDashboardNotice(req, res) {
  try {
    const row = await DashboardNotice.findByIdAndDelete(req.params.id).lean();
    if (!row) {
      return res.status(404).json({ success: false, message: "공지를 찾을 수 없습니다." });
    }
    const keys = (row.images || []).map((image) => image.key).filter(Boolean);
    await Promise.all(keys.map((key) => deleteFileFromS3(key)));
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[dashboardNotice] delete", error);
    return res.status(500).json({
      success: false,
      message: "공지를 삭제하지 못했습니다.",
    });
  }
}

export async function addAdminDashboardNoticeImage(req, res) {
  try {
    const file = req.file;
    if (!file?.buffer?.length) {
      return res.status(400).json({ success: false, message: "이미지 파일을 선택해 주세요." });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return res.status(400).json({ success: false, message: "이미지는 8MB까지 첨부할 수 있습니다." });
    }
    const ext = extname(String(file.originalname || "")).toLowerCase();
    const type = String(file.mimetype || "").toLowerCase();
    if (!IMAGE_TYPES.has(type) || !IMAGE_EXTS.has(ext)) {
      return res.status(400).json({
        success: false,
        message: "jpg, png, webp, gif 이미지만 첨부할 수 있습니다.",
      });
    }
    const notice = await DashboardNotice.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({ success: false, message: "공지를 찾을 수 없습니다." });
    }
    if ((notice.images || []).length >= MAX_IMAGES) {
      return res.status(400).json({
        success: false,
        message: `이미지는 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`,
      });
    }
    const key = `dashboard-notices/${notice._id}/${randomUUID()}${ext}`;
    await putObjectToS3(key, file.buffer, { contentType: type });
    const fileName = String(file.originalname || "image")
      .replace(/[/\\]/g, "")
      .slice(0, 180);
    notice.images.push({ key, fileName, contentType: type });
    notice.updatedBy = req.user?._id;
    await notice.save();
    return res.status(200).json({
      success: true,
      data: await toNoticeDto(notice.toObject(), { includeKeys: true }),
    });
  } catch (error) {
    console.error("[dashboardNotice] image", error);
    return res.status(500).json({
      success: false,
      message: "이미지를 올리지 못했습니다.",
    });
  }
}

export async function removeAdminDashboardNoticeImage(req, res) {
  try {
    const key = String(req.body?.key || "").trim();
    if (!key) {
      return res.status(400).json({ success: false, message: "삭제할 이미지를 지정해 주세요." });
    }
    const notice = await DashboardNotice.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({ success: false, message: "공지를 찾을 수 없습니다." });
    }
    const before = notice.images.length;
    notice.images = notice.images.filter((image) => image.key !== key);
    if (notice.images.length === before) {
      return res.status(404).json({ success: false, message: "이미지를 찾을 수 없습니다." });
    }
    notice.updatedBy = req.user?._id;
    await notice.save();
    await deleteFileFromS3(key);
    return res.status(200).json({
      success: true,
      data: await toNoticeDto(notice.toObject(), { includeKeys: true }),
    });
  } catch (error) {
    console.error("[dashboardNotice] image delete", error);
    return res.status(500).json({
      success: false,
      message: "이미지를 삭제하지 못했습니다.",
    });
  }
}
