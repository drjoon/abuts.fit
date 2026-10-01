// 치과 의뢰에 들어온 스캔바디·심플 규격과 임플란트를 쌓고(ScanbodySpecDemand), 공용 형상이 없는 것을 관리자에게 보인다.
// 관리자가 제조사에서 받아 등록하는 것이 기본이다. 기공소에는 관리자가 표시한 규격(labUploadRequested)만 올려 달라고 한다.
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

/**
 * 쌓인 규격 중 공용 형상이 없는 것. 최근 의뢰가 먼저.
 * practiceCount·labCount는 관리자가 「시장에서 거의 안 쓰는 것」을 고를 때 본다.
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
  return specs
    .filter((row) => (row.type === "template" ? !hasTemplate(templates, row) : !hasLibraryShape(libraries, row)))
    .map((row) => ({
      key: row.key,
      type: row.type,
      maker: row.maker,
      diameter: row.diameter,
      height: row.height,
      heights: row.heights || [],
      teethCount: row.teethCount || 0,
      transferCount: (row.transferIds || []).length,
      practiceCount: (row.practiceAnchorIds || []).length,
      labCount: (row.labAnchorIds || []).length,
      implants: topImplants(row.implants),
      firstAt: row.firstAt,
      latestAt: row.lastAt,
      labUploadRequested: Boolean(row.labUploadRequested),
    }));
}

/** 관리자: 이 규격은 기공소에 올려 달라고 한다(또는 거둔다). */
export async function setLabUploadRequested(key, requested, adminId) {
  const doc = await ScanbodySpecDemand.findOneAndUpdate(
    { key },
    {
      $set: {
        labUploadRequested: Boolean(requested),
        labUploadRequestedAt: requested ? new Date() : null,
        labUploadRequestedBy: requested ? adminId : null,
      },
    },
    { new: true },
  ).lean();
  return doc ? { key: doc.key, labUploadRequested: doc.labUploadRequested } : null;
}

/** 기공소 AI 디자인: 업로드를 요청한 규격 key. 나머지는 「어벗츠가 준비 중」으로만 보인다. */
export async function listLabUploadRequestKeys() {
  const rows = await ScanbodySpecDemand.find({ labUploadRequested: true }).select({ key: 1 }).lean();
  return rows.map((row) => row.key);
}
