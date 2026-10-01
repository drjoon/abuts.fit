// 치과 의뢰에 들어온 스캔바디·심플 규격과 임플란트를 쌓고(ScanbodySpecDemand), 공용 형상이 없는 것을 관리자에게 보인다.
// 관리자가 제조사에 접촉해 받아 등록하는 것이 기본이다. 제조사를 찾을 수 없는 규격만 관리자가 표시하면(labUploadRequested) 기공소에 올려 달라고 한다.
// 저장은 규격(key)마다 하고, 관리자 목록에서는 제조사·심플 종류 한 장으로 묶어 빠뜨린 규격을 같이 보인다.
// 판정은 AI 디자인과 같다(scanbodyLibraryApi.ts orderedScanbodyCandidates·abutmentTemplateFor·orderTemplateSpec·scanbodySpecKey).
// 기공소 자기 것(공용 아님)·사본은 세지 않는다. 모두가 쓰는 공용이 목표다.
// related files:
// - web/backend/models/scanbodySpecDemand.model.js
// - web/frontend/src/shared/practice/scanbodyLibraryApi.ts
// - web/frontend/src/pages/admin/dashboard/ScanbodyDemandCard.tsx
import { Types } from "mongoose";
import ScanbodySpecDemand from "../models/scanbodySpecDemand.model.js";
import ScanbodyLibrary from "../models/scanbodyLibrary.model.js";
import AbutmentTemplate from "../models/abutmentTemplate.model.js";
import { emitAppEventToRoles } from "../socket.js";

const DESIGNABLE_TYPES = new Set(["크라운", "인레이", "온레이", "브리지"]);
const SIMPLE_ABUTMENT_KINDS = new Set(["심플어벗", "심플밀링"]);
const SIMPLE_HEALING_KIND = "심플힐링";
const DIAMETER_TOL_MM = 0.25;
const HEIGHT_TOL_MM = 0.4;
/** 프론트 SCANBODY_MAKER_ALIASES와 같이 고친다. */
const MAKER_ALIASES = { 지오메디: ["geomedi", "geo_", "geo "] };

const text = (value) => String(value ?? "").trim();
const makerKey = (value) => value.toLowerCase().replace(/[\s·.-]+/g, "");
const num = (value) => Number(text(value).replace(",", "."));
const idOf = (value) => (value && Types.ObjectId.isValid(String(value)) ? new Types.ObjectId(String(value)) : null);

function libraryMatchesMaker(lib, maker) {
  const key = makerKey(maker);
  if (!key) return false;
  if ((lib.manufacturers || []).some((row) => makerKey(row) === key)) return true;
  const blob = `${lib.systemName} ${(lib.fileNames || []).join(" ")}`.toLowerCase();
  const aliases = MAKER_ALIASES[maker.trim()] ?? [];
  return blob.replace(/\s+/g, "").includes(key) || aliases.some((alias) => blob.includes(alias));
}

function hasLibraryShape(libraries, { maker, diameter, height }) {
  const d = num(diameter);
  const h = num(height);
  for (const lib of libraries) {
    if (!libraryMatchesMaker(lib, maker)) continue;
    const parts = new Map((lib.parts || []).map((part) => [part.partId, part]));
    for (const kit of lib.kits || []) {
      for (const id of kit.scanAbutmentPartIds || []) {
        const part = parts.get(id);
        if (!part || part.diameterMm == null || part.heightMm == null) continue;
        const dd = Number.isFinite(d) ? Math.abs(part.diameterMm - d) : 0;
        const dh = Number.isFinite(h) ? Math.abs(part.heightMm - h) : 0;
        if (dd <= DIAMETER_TOL_MM && dh <= HEIGHT_TOL_MM) return true;
      }
    }
  }
  return false;
}

function hasTemplate(templates, { maker, diameter, height }) {
  return templates.some(
    (row) =>
      row.kind === maker &&
      Number(row.diameter) === Number(diameter) &&
      (maker !== SIMPLE_HEALING_KIND || !height || row.height === height),
  );
}

/** 치아 의뢰 한 줄 → 찾아야 할 규격. AI 디자인이 형상을 찾지 않는 치아는 null. 프론트 scanbodySpecKey와 같은 key. */
function demandOf(work) {
  if (!DESIGNABLE_TYPES.has(text(work?.prosthesisType) || "크라운")) return null;
  if (work?.customAbutment !== true && !text(work?.implantManufacturer)) return null;
  const maker = text(work?.abutmentManufacturer);
  const diameter = text(work?.abutmentDiameter);
  const rawHeight = text(work?.abutmentHeight);
  if (!maker) return null;
  const isTemplate = SIMPLE_ABUTMENT_KINDS.has(maker) || maker === SIMPLE_HEALING_KIND;
  if (isTemplate && !diameter) return null;
  const type = isTemplate ? "template" : "library";
  const orderHeight = isTemplate ? rawHeight.toUpperCase() : rawHeight;
  const height = SIMPLE_ABUTMENT_KINDS.has(maker) ? "" : orderHeight;
  return {
    key: [type, maker, diameter, height].join("|"),
    type,
    maker,
    diameter,
    height,
    orderHeight,
    implant: {
      manufacturer: text(work?.implantManufacturer),
      brand: text(work?.implantBrand),
      family: text(work?.implantFamily),
      type: text(work?.implantType),
    },
  };
}

const implantField = (implant) =>
  Buffer.from([implant.manufacturer, implant.brand, implant.family, implant.type].join("|")).toString("base64url");

/** 의뢰 한 건을 규격별로 쌓는다. 같은 의뢰를 다시 넣으면 세지 않는다. */
export async function recordScanbodyDemand(transfer, toothWorks = transfer?.toothWorks) {
  const transferId = idOf(transfer?._id);
  if (!transferId) return 0;
  const specs = new Map();
  for (const work of toothWorks || []) {
    const spec = demandOf(work);
    if (!spec) continue;
    const row = specs.get(spec.key) ?? { spec, teeth: 0, heights: new Set(), implants: new Map() };
    row.teeth += 1;
    if (spec.orderHeight) row.heights.add(spec.orderHeight);
    if (spec.implant.manufacturer) {
      const field = implantField(spec.implant);
      const prev = row.implants.get(field) ?? { ...spec.implant, count: 0 };
      prev.count += 1;
      row.implants.set(field, prev);
    }
    specs.set(spec.key, row);
  }
  const at = transfer.createdAt ? new Date(transfer.createdAt) : new Date();
  const practiceIds = [idOf(transfer.practiceBusinessAnchorId)].filter(Boolean);
  const labIds = [idOf(transfer.targetLabAnchorId), idOf(transfer.assigneeLabAnchorId)].filter(Boolean);
  let added = 0;
  for (const { spec, teeth, heights, implants } of specs.values()) {
    const set = {};
    const inc = { teethCount: teeth };
    for (const [field, implant] of implants) {
      for (const name of ["manufacturer", "brand", "family", "type"]) set[`implants.${field}.${name}`] = implant[name];
      inc[`implants.${field}.count`] = implant.count;
    }
    try {
      await ScanbodySpecDemand.updateOne(
        { key: spec.key, transferIds: { $ne: transferId } },
        {
          $setOnInsert: { type: spec.type, maker: spec.maker, diameter: spec.diameter, height: spec.height },
          ...(Object.keys(set).length ? { $set: set } : {}),
          $inc: inc,
          $addToSet: {
            transferIds: transferId,
            heights: { $each: [...heights] },
            practiceAnchorIds: { $each: practiceIds },
            labAnchorIds: { $each: labIds },
          },
          $min: { firstAt: at },
          $max: { lastAt: at },
        },
        { upsert: true },
      );
      added += 1;
    } catch (error) {
      // 이미 이 의뢰를 센 규격이면 필터가 안 맞아 upsert가 같은 key로 부딪친다.
      if (error?.code !== 11000) throw error;
    }
  }
  return added;
}

/** 의뢰 생성·수정 뒤 응답을 기다리지 않고 쌓고, 관리자 대시보드에 다시 세라고 알린다. */
export function notifyScanbodyDemand(transfer, toothWorks = transfer?.toothWorks) {
  void recordScanbodyDemand(transfer, toothWorks)
    .then((added) => {
      if (added > 0) emitAppEventToRoles(["admin"], "scanbody:demand-updated", { at: new Date().toISOString() });
    })
    .catch((error) => console.error("[scanbody-demand] record failed", error?.message));
}

function topImplants(implants) {
  return Object.values(implants || {})
    .filter((row) => row && row.manufacturer)
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, 3)
    .map((row) => ({
      manufacturer: row.manufacturer,
      brand: row.brand || "",
      family: row.family || "",
      type: row.type || "",
      count: row.count || 0,
    }));
}

const HEIGHT_RANK = { S: 0, M: 1, L: 2, XL: 3 };

function sortHeights(heights) {
  return [...new Set((heights || []).filter(Boolean))].sort(
    (a, b) => (HEIGHT_RANK[a] ?? 9) - (HEIGHT_RANK[b] ?? 9) || String(a).localeCompare(String(b)),
  );
}

function specView(row) {
  return {
    key: row.key,
    diameter: row.diameter || "",
    height: row.height || "",
    heights: sortHeights(row.heights),
  };
}

function mergeImplants(rows) {
  const map = new Map();
  for (const row of rows) {
    for (const [field, implant] of Object.entries(row.implants || {})) {
      if (!implant?.manufacturer) continue;
      const prev = map.get(field) ?? {
        manufacturer: implant.manufacturer,
        brand: implant.brand || "",
        family: implant.family || "",
        type: implant.type || "",
        count: 0,
      };
      prev.count += implant.count || 0;
      map.set(field, prev);
    }
  }
  return topImplants(Object.fromEntries(map));
}

function aggregateDemand(rows) {
  const transferIds = new Set();
  const practiceIds = new Set();
  const labIds = new Set();
  let teeth = 0;
  let firstAt = null;
  let lastAt = null;
  for (const row of rows) {
    teeth += row.teethCount || 0;
    for (const id of row.transferIds || []) transferIds.add(String(id));
    for (const id of row.practiceAnchorIds || []) practiceIds.add(String(id));
    for (const id of row.labAnchorIds || []) labIds.add(String(id));
    if (row.firstAt && (!firstAt || row.firstAt < firstAt)) firstAt = row.firstAt;
    if (row.lastAt && (!lastAt || row.lastAt > lastAt)) lastAt = row.lastAt;
  }
  return {
    teethCount: teeth,
    transferCount: transferIds.size,
    practiceCount: practiceIds.size,
    labCount: labIds.size,
    firstAt,
    lastAt,
  };
}

function demandCard(row, extras) {
  return {
    key: extras.key,
    keys: extras.keys,
    type: row.type,
    maker: row.maker,
    diameter: extras.diameter,
    height: extras.height,
    heights: extras.heights,
    specs: extras.specs,
    teethCount: extras.teethCount,
    transferCount: extras.transferCount,
    practiceCount: extras.practiceCount,
    labCount: extras.labCount,
    implants: extras.implants,
    firstAt: extras.firstAt,
    latestAt: extras.latestAt,
    labUploadRequested: extras.labUploadRequested,
  };
}

function specSort(a, b) {
  const da = Number(String(a.diameter).replace(",", "."));
  const db = Number(String(b.diameter).replace(",", "."));
  const aNum = Number.isFinite(da);
  const bNum = Number.isFinite(db);
  if (aNum !== bNum) return aNum ? -1 : 1;
  if (aNum && da !== db) return da - db;
  if (!aNum && a.diameter !== b.diameter) return a.diameter.localeCompare(b.diameter, "ko");
  const ha = Number(String(a.height).replace(",", "."));
  const hb = Number(String(b.height).replace(",", "."));
  if (Number.isFinite(ha) && Number.isFinite(hb) && ha !== hb) return ha - hb;
  const rank = (HEIGHT_RANK[a.height] ?? 9) - (HEIGHT_RANK[b.height] ?? 9);
  if (rank) return rank;
  return a.height.localeCompare(b.height) || a.key.localeCompare(b.key);
}

/** 제조사 라이브러리·심플 템플릿 모두 이름 한 장으로 묶고, 없는 규격은 specs에 둔다. */
function groupDemandCards(rows) {
  const buckets = new Map();
  for (const row of rows) {
    const groupKey = `${row.type}|${row.maker}`;
    const bucket = buckets.get(groupKey) ?? [];
    bucket.push(row);
    buckets.set(groupKey, bucket);
  }
  const cards = [...buckets.values()].map((bucket) => {
    const stats = aggregateDemand(bucket);
    const specs = bucket.map(specView).sort(specSort);
    return {
      sortAt: stats.lastAt ? new Date(stats.lastAt).getTime() : 0,
      view: demandCard(bucket[0], {
        key: `${bucket[0].type}|${bucket[0].maker}`,
        keys: bucket.map((row) => row.key),
        diameter: "",
        height: "",
        heights: [],
        specs,
        implants: mergeImplants(bucket),
        labUploadRequested: bucket.every((row) => row.labUploadRequested),
        latestAt: stats.lastAt,
        ...stats,
      }),
    };
  });
  cards.sort((a, b) => b.sortAt - a.sortAt);
  return cards.map((card) => card.view);
}

/**
 * 쌓인 규격 중 공용 형상이 없는 것. 최근 의뢰가 먼저.
 * 제조사·심플 종류마다 한 장이고, specs가 아직 없는 규격이다. 하나라도 등록되면 그 규격만 빠진다.
 * practiceCount·labCount는 관리자가 제조사를 못 찾아 기공소에 넘길지 볼 때 쓴다.
 */
export async function listScanbodyDemand() {
  const shared = { forkOf: null, $or: [{ ownerAnchorId: null }, { isPublic: true }] };
  const [specs, libraries, templates] = await Promise.all([
    ScanbodySpecDemand.find({}).sort({ lastAt: -1 }).limit(500).lean(),
    ScanbodyLibrary.find(shared)
      .select({ systemName: 1, fileNames: 1, manufacturers: 1, "parts.partId": 1, "parts.diameterMm": 1, "parts.heightMm": 1, "kits.scanAbutmentPartIds": 1 })
      .lean(),
    AbutmentTemplate.find(shared).select({ kind: 1, diameter: 1, height: 1 }).lean(),
  ]);
  const missing = specs.filter((row) =>
    row.type === "template" ? !hasTemplate(templates, row) : !hasLibraryShape(libraries, row),
  );
  return groupDemandCards(missing);
}

/** 관리자: 이 카드 안 규격 전부를 기공소에 올려 달라고 한다(또는 거둔다). */
export async function setLabUploadRequested(keys, requested, adminId) {
  const list = [...new Set((Array.isArray(keys) ? keys : [keys]).map((key) => text(key)).filter(Boolean))];
  if (list.length === 0) return null;
  const on = Boolean(requested);
  const result = await ScanbodySpecDemand.updateMany(
    { key: { $in: list } },
    {
      $set: {
        labUploadRequested: on,
        labUploadRequestedAt: on ? new Date() : null,
        labUploadRequestedBy: on ? adminId : null,
      },
    },
  );
  if (!result.matchedCount) return null;
  return { keys: list, labUploadRequested: on };
}

/** 기공소 AI 디자인: 업로드를 요청한 규격 key. 나머지는 「어벗츠가 준비 중」으로만 보인다. */
export async function listLabUploadRequestKeys() {
  const rows = await ScanbodySpecDemand.find({ labUploadRequested: true }).select({ key: 1 }).lean();
  return rows.map((row) => row.key);
}
