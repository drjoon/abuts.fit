// 스캔바디 라이브러리 묶음 키. `C1W_LL_H55`·`BG41_LS`처럼 규격만 다른 코드는 한 연결로 합친다.
// 파일 경로·라이브러리 안내 XML에 제조사·임플란트 브랜드·타입이 있으면 그 값을 같이 남긴다.
// 프론트 `scanbodyLibraryIdentity.ts`의 코드 분해·별칭과 같게 유지한다.
// related files:
// - web/backend/services/scanbodyLibraryImport.service.js
// - web/frontend/src/shared/practice/scanbodyLibraryIdentity.ts

const SPEC_CODE =
  /^([A-Za-z][A-Za-z0-9]*?)_((?:LL|LS|CMFit)(?:_H\d+(?:\.\d+)?)?|H\d+(?:\.\d+)?)$/;

const SKIP_DIR = new Set([
  "library",
  "libraries",
  "implant",
  "implants",
  "3shape",
  "exocad",
  "dentalcadapp",
  "scanbody",
  "scanbodies",
  "modelcreator",
]);

/** 의뢰 제조사 이름(한글·영문)과 파일에 적힌 이름을 같은 제조사로 본다. */
const MAKER_ALIAS_GROUPS = [
  ["osstem", "오스템", "오스템us", "osstemus"],
  ["neobiotech", "네오바이오텍", "네오", "neo"],
  ["dentium", "덴티움"],
  ["dio", "디오"],
  ["megagen", "메가젠"],
  ["dentis", "덴티스"],
  ["geomedi", "지오메디", "geo"],
];

const META_FIELDS = {
  provider: "manufacturer",
  manufacturer: "manufacturer",
  manufacturername: "manufacturer",
  company: "manufacturer",
  supplier: "manufacturer",
  librarycreators: "manufacturer",
  brand: "brand",
  implantbrand: "brand",
  system: "type",
  systemtype: "type",
  implantsystem: "type",
  libraryname: "libraryName",
};

export const makerKey = (value) => String(value ?? "").toLowerCase().replace(/[\s·._-]+/g, "");

const clip = (value, max = 80) => String(value ?? "").trim().slice(0, max);

const SPEC_ONLY_FAMILY = new Set(["ll", "ls", "cmfit", "cm"]);

export function splitScanbodyCode(name) {
  const raw = clip(name, 200);
  const match = raw.match(SPEC_CODE);
  if (!match || SPEC_ONLY_FAMILY.has(match[1].toLowerCase())) return { family: raw, spec: "", code: raw };
  return { family: match[1], spec: match[2].replace(/_/g, " "), code: raw };
}

function looksHuman(name) {
  return /[가-힣]/.test(name) || /\s/.test(name);
}

/** 업로드 경로에서 제조사·브랜드 폴더. 파일 이름과 `library` 같은 껍질은 뺀다. */
export function pathIdentity(filePath) {
  const parts = String(filePath || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);
  if (parts.length > 0) parts.pop();
  const segs = parts.filter((part) => {
    const key = part.toLowerCase().replace(/[\s._-]+/g, "");
    if (!key || SKIP_DIR.has(key)) return false;
    if (/^\d+$/.test(key)) return false;
    return true;
  });
  return {
    manufacturer: clip(segs[0]),
    brand: clip(segs[1]),
    typeFolder: clip(segs.slice(2).join(" ")),
  };
}

/**
 * 시스템 이름·경로·XML에서 묶음 제목과 메타를 만든다.
 * 규격 접미사(LL H55, LS, CMFit)는 연결 코드에서 떼고, 제조사·브랜드가 있으면 제목에 붙인다.
 */
export function describeLibrary({ systemName, filePath = "", meta = null }) {
  const codeName = clip(baseFile(systemName), 200);
  const code = splitScanbodyCode(codeName);
  const fromPath = pathIdentity(filePath);
  const manufacturer = clip(meta?.manufacturer) || fromPath.manufacturer;
  const brand = clip(meta?.brand) || fromPath.brand;
  const folderType = clip(meta?.type) || fromPath.typeFolder;
  const connection = code.spec ? code.family : "";
  let implantType = connection || folderType;
  let title = codeName || "스캔바디";
  if (code.spec) {
    implantType = code.family;
    title = [manufacturer, brand, code.family].filter(Boolean).join(" ") || code.family;
  } else if (!looksHuman(codeName) && (manufacturer || brand || folderType)) {
    implantType = folderType || codeName;
    const tail = folderType && folderType !== codeName ? folderType : codeName;
    title = [manufacturer, brand, tail].filter(Boolean).join(" ") || codeName;
  }
  const groupKey = [makerKey(manufacturer), makerKey(brand), makerKey(code.spec ? code.family : title)].join("|");
  return {
    manufacturer,
    brand,
    implantType: clip(implantType),
    spec: code.spec,
    code: code.code,
    title: clip(title, 200) || "스캔바디",
    groupKey,
  };
}

function baseFile(path) {
  const name = String(path || "").split("/").pop() || "";
  return name.replace(/\.dme$/i, "");
}

/** LibraryImportInfo·exocad config처럼 짧은 텍스트 노드에서 제조사·브랜드·타입만 고른다. */
export function harvestLibraryMeta(node, out = {}, depth = 0) {
  if (!node || typeof node !== "object" || depth > 8) return out;
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("@_") || key === "#text") continue;
    const field = META_FIELDS[key.toLowerCase()];
    if (field && (typeof value === "string" || typeof value === "number")) {
      const token = clip(value);
      if (token && !out[field]) out[field] = token;
    } else if (value && typeof value === "object") {
      harvestLibraryMeta(value, out, depth + 1);
    }
  }
  return out;
}

export function metaFromSystemProps(props) {
  if (!props) return {};
  return {
    manufacturer: clip(props.Manufacturer || props.ManufacturerName || props.Company),
    brand: clip(props.Brand || props.ImplantBrand),
    type: clip(props.SystemType || props.Type),
  };
}

function aliasGroup(key) {
  return MAKER_ALIAS_GROUPS.find((group) => group.some((alias) => makerKey(alias) === key)) ?? null;
}

function kitRows(kits) {
  if (!kits) return [];
  if (kits instanceof Map) return [...kits.values()];
  return Array.isArray(kits) ? kits : [];
}

function relabelKit(kit, identity) {
  const next = { ...kit };
  if (identity.code) next.code = next.code || identity.code;
  if (identity.spec) next.spec = next.spec || identity.spec;
  const current = String(next.name || "").trim();
  if (identity.spec && (!current || current === identity.code || current === identity.title)) next.name = identity.spec;
  return next;
}

/**
 * 한 파일·한 묶음에서 규격만 다른 시스템을 한 라이브러리로 합친다.
 * `kits`·`parts`가 Map이면 Map으로 돌려준다.
 */
export function collapseParsedLibraries(libraries, filePath = "", fileMeta = null) {
  const groups = new Map();
  for (const lib of libraries) {
    const meta = {
      manufacturer: lib.meta?.manufacturer || fileMeta?.manufacturer || "",
      brand: lib.meta?.brand || fileMeta?.brand || "",
      type: lib.meta?.type || fileMeta?.type || "",
    };
    const identity = describeLibrary({
      systemName: lib.systemName,
      filePath: lib.filePath || filePath,
      meta,
    });
    const useMap = lib.kits instanceof Map || lib.parts instanceof Map;
    let group = groups.get(identity.groupKey);
    if (!group) {
      group = {
        ...lib,
        systemName: identity.title,
        implantManufacturer: identity.manufacturer,
        brand: identity.brand,
        implantType: identity.implantType,
        parts: useMap ? new Map() : [],
        kits: useMap ? new Map() : [],
      };
      groups.set(identity.groupKey, group);
    } else {
      if (!group.implantManufacturer) group.implantManufacturer = identity.manufacturer;
      if (!group.brand) group.brand = identity.brand;
      if (!group.implantType) group.implantType = identity.implantType;
      group.fileNames = [...new Set([...(group.fileNames || []), ...(lib.fileNames || [])])];
      group.containerVersions = [...new Set([...(group.containerVersions || []), ...(lib.containerVersions || [])])].sort();
    }
    for (const [hash, part] of lib.parts instanceof Map ? lib.parts : new Map()) {
      if (group.parts instanceof Map) group.parts.set(hash, part);
    }
    if (!(lib.parts instanceof Map) && Array.isArray(lib.parts)) {
      for (const part of lib.parts) {
        if (Array.isArray(group.parts)) group.parts.push(part);
      }
    }
    for (const kit of kitRows(lib.kits)) {
      const next = relabelKit(kit, identity);
      if (group.kits instanceof Map) {
        let kitId = next.kitId;
        let n = 2;
        while (group.kits.has(kitId) && group.kits.get(kitId).scanAbutmentPartIds?.join(",") !== next.scanAbutmentPartIds?.join(",")) {
          kitId = `${next.kitId}#${n}`;
          n += 1;
        }
        const prev = group.kits.get(kitId);
        if (!prev) group.kits.set(kitId, { ...next, kitId });
        else {
          for (const partId of next.scanAbutmentPartIds || []) {
            if (!prev.scanAbutmentPartIds.includes(partId)) prev.scanAbutmentPartIds.push(partId);
          }
        }
      } else if (Array.isArray(group.kits)) {
        group.kits.push(next);
      }
    }
  }
  return [...groups.values()];
}

/** 이 라이브러리가 의뢰 스캔바디 제조사(한글 이름 포함)를 가리키는지. */
export function libraryMatchesMaker(lib, maker) {
  const key = makerKey(maker);
  if (!key) return false;
  const labels = [
    ...(lib?.manufacturers || []),
    lib?.implantManufacturer,
    lib?.brand,
    lib?.implantManufacturer && lib?.brand ? `${lib.implantManufacturer} ${lib.brand}` : "",
    lib?.systemName,
    ...(lib?.fileNames || []),
  ].filter(Boolean);
  if (labels.some((label) => makerKey(label) === key)) return true;
  const group = aliasGroup(key);
  if (!group) return false;
  const groupKeys = new Set(group.map((alias) => makerKey(alias)));
  return labels.some((label) => groupKeys.has(makerKey(label)));
}
