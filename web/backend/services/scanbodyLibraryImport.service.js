// 업로드 묶음(ZIP) → 스캔바디 라이브러리 초안. DB·S3를 건드리지 않는 순수 해석 단계.
// - 3Shape `.dme`(ZIP): Materials.xml의 임플란트 시스템·키트·스캔바디(.dcm).
// - exocad: config.xml(ImplantLibraryEntry)의 타입별 스캔바디 STL(MarkerFilename)과 축.
// - 형상 한 개(.dcm·.stl·.ply·.obj): 기공소 스캔·다른 CAD 내보내기. 축은 브라우저가 계산해 보낸다(parseScanbodyMesh).
// - 제조사 형상(.stl·.stp·.step·.dcm) 여러 개: 파일마다 규격 하나로 모두 등록한다. 축은 긴 방향·가는 쪽을 플랫폼으로 잡는다.
// 형상은 좌표·면만 꺼내 모델 좌표 이진 STL로 새로 만든다(scanbodyGeometry.js). 스캔바디만 저장한다.
// 제조사 묶음은 임플란트·규격이 모두 들어 있다. 의뢰에 나온 규격만 고르지 않고 파일 안 스캔바디를 전부 등록한다.
// `.dme`는 묶음 안에서 한 단계만 푼다. 그 밖의 중첩 압축과 .sdfa·.ipflib(암호화)은 풀지 않는다.
// related files:
// - web/backend/utils/safeUnzip.js
// - web/backend/utils/scanbodyGeometry.js
// - web/backend/services/scanbodyLibraryUpload.service.js
import { XMLParser } from "fast-xml-parser";
import { isZip, normalizeEntryName, safeUnzip } from "../utils/safeUnzip.js";
import {
  ScanbodyInputError,
  LIBRARY_SHAPE_PATTERN,
  alignScanbodyToModel,
  canonicalStlHash,
  encodeCanonicalStl,
  frameToModel,
  transformToModel,
  trianglesFromHps,
  trianglesFromLibraryShape,
  trianglesFromMeshFile,
  trianglesFromStl,
} from "../utils/scanbodyGeometry.js";
import {
  collapseParsedLibraries,
  describeLibrary,
  harvestLibraryMeta,
  metaFromSystemProps,
  splitScanbodyCode,
} from "../utils/scanbodyLibraryIdentity.js";

export const SCANBODY_UPLOAD_LIMITS = {
  // 브라우저가 25MB 안팎으로 나눠 올린다. 한 폴더·한 .dme가 큰 제조사 배포본도 받게 넉넉히 둔다.
  maxUploadBytes: 1024 * 1024 * 1024,
  maxBundleEntries: 5000,
  maxDmeEntries: 3000,
  maxEntryBytes: 64 * 1024 * 1024,
  // 업로드 한도와 같으면 1GB짜리 묶음은 풀다 걸린다. .dme 안 .dcm은 이미 압축돼 풀어도 거의 그대로다.
  maxTotalBytes: 2048 * 1024 * 1024,
  maxXmlBytes: 32 * 1024 * 1024,
};

const PART_CLASS = {
  ispScanAbutment: "scanAbutment",
  ispImplant: "implant",
  ispScrew: "screw",
  ispBase: "base",
  ispBlank: "blank",
  ispAnalogInterface: "analogInterface",
  ispInterface: "interface",
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: false,
  htmlEntities: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) =>
    ["Object", "Property", "String", "List", "ImplantTypeConfig", "ImplantSubtypeConfig"].includes(name),
});

function parseXml(bytes, label) {
  if (bytes.length > SCANBODY_UPLOAD_LIMITS.maxXmlBytes) throw new ScanbodyInputError(`${label}이 너무 큽니다.`);
  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length).toString("utf8").replace(/^\uFEFF/, "");
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new ScanbodyInputError(`${label}에 허용하지 않는 XML 선언이 있습니다.`);
  try {
    return xmlParser.parse(text);
  } catch {
    throw new ScanbodyInputError(`${label}을 읽지 못했습니다.`);
  }
}

const text = (value, max = 200) => String(value ?? "").trim().slice(0, max);
const baseName = (path) => path.split("/").pop() ?? path;
const dirName = (path) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const stripExt = (name) => name.replace(/\.[^.]+$/, "");

function toBuffer(bytes) {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length);
}

function canonicalPart(triangles) {
  const stl = encodeCanonicalStl(triangles);
  return { hash: canonicalStlHash(stl), stl };
}

// ─── 3Shape .dme ───────────────────────────────────────────────

function collectObjects(node, out) {
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("@_") || key === "#text") continue;
    const rows = Array.isArray(value) ? value : [value];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      if (key === "Object" && row["@_type"]) out.push(row);
      collectObjects(row, out);
    }
  }
}

function objectProps(obj) {
  const out = {};
  for (const tag of ["Property", "String"]) {
    for (const row of obj[tag] ?? []) {
      const name = row?.["@_name"];
      if (name) out[name] = String(row["@_value"] ?? "");
    }
  }
  return out;
}

const refId = (value) => {
  const v = text(value, 300);
  return v && v !== "_NULL_" ? v : null;
};

/** 키트 XML의 속성·목록에 적힌 부품 id. 스캔바디가 아닌 것은 나중에 걸러진다. */
function refCandidates(obj) {
  const ids = [];
  const props = objectProps(obj);
  for (const [name, value] of Object.entries(props)) {
    if (name === "Name" || name === "InRecycleBin" || name === "ItemID" || name === "CreatorSiteID") continue;
    const id = refId(value);
    if (id) ids.push(id);
  }
  for (const list of obj.List ?? []) {
    for (const row of list.String ?? []) {
      const id = refId(row?.["@_value"]);
      if (id) ids.push(id);
    }
  }
  return ids;
}
const itemKey = (p) => `${p.CreatorSiteID ?? ""}_${p.ItemID ?? ""}`;
const cadPath = (path) =>
  normalizeEntryName(String(path || "").replace(/^:[A-Z]+:/i, "")).toLowerCase();

function parseDme(bytes, fileName, budget, notes) {
  const { files } = safeUnzip(bytes, {
    want: (name) =>
      /(^|\/)materials\.xml$/i.test(name) ||
      /(^|\/)libraryimportinfo\.xml$/i.test(name) ||
      /\.dcm$/i.test(name),
    maxEntries: SCANBODY_UPLOAD_LIMITS.maxDmeEntries,
    maxEntryBytes: SCANBODY_UPLOAD_LIMITS.maxEntryBytes,
    budget,
    label: fileName,
  });
  return parseDmeFiles(files, fileName, notes);
}

function parseDmeFiles(files, fileName, notes) {
  const materialsName = [...files.keys()].find((name) => /(^|\/)materials\.xml$/i.test(name));
  if (!materialsName) throw new ScanbodyInputError(`${fileName}: Materials.xml이 없습니다.`);
  const doc = parseXml(files.get(materialsName), `${fileName} Materials.xml`);
  const containerVersion = text(doc?.DentalContainer?.["@_version"], 40);

  const objects = [];
  collectObjects(doc, objects);
  const byType = (type) =>
    objects
      .filter((obj) => obj["@_type"] === type)
      .map(objectProps)
      .filter((p) => p.InRecycleBin !== "True");

  const systemProps = new Map(byType("TDM_Item_ImplantSystem").map((p) => [itemKey(p), p]));
  const namedObjects = new Map();
  for (const obj of objects) {
    const type = String(obj["@_type"] || "");
    if (!/Manufacturer|Company|Supplier/i.test(type)) continue;
    const props = objectProps(obj);
    namedObjects.set(itemKey(props), props);
  }
  const systemMeta = (props) => {
    const linked = props?.ManufacturerID ? namedObjects.get(refId(props.ManufacturerID)) : null;
    const fromLink = linked ? metaFromSystemProps(linked) : {};
    const own = metaFromSystemProps(props);
    if (!own.manufacturer && linked?.Name) fromLink.manufacturer = text(linked.Name, 80);
    return {
      manufacturer: own.manufacturer || fromLink.manufacturer || "",
      brand: own.brand || fromLink.brand || "",
      type: own.type || fromLink.type || "",
    };
  };
  const rawParts = new Map(byType("TDM_Item_ImplantSystemPart").map((p) => [itemKey(p), p]));
  const rawKitObjects = objects.filter(
    (obj) => obj["@_type"] === "TDM_Item_AbutmentKit" && objectProps(obj).InRecycleBin !== "True",
  );
  const extras = byType("TDM_Item_AbutmentKitImplantPartExtraRelation");

  const dcmByPath = new Map([...files.keys()].filter((n) => /\.dcm$/i.test(n)).map((n) => [n.toLowerCase(), n]));
  const findDcm = (cadFile) => {
    const want = cadPath(cadFile);
    if (dcmByPath.has(want)) return dcmByPath.get(want);
    for (const [path, name] of dcmByPath) if (want.endsWith(`/${path}`) || path.endsWith(want)) return name;
    const base = baseName(want);
    for (const [path, name] of dcmByPath) if (baseName(path) === base) return name;
    return null;
  };

  const partCache = new Map();
  const attached = new Set();
  const loadScanPart = (partId) => {
    if (!partId) return null;
    if (partCache.has(partId)) return partCache.get(partId);
    let part = null;
    const raw = rawParts.get(partId);
    if (raw && PART_CLASS[raw.PartClass] === "scanAbutment") {
      const entry = raw.CADFile ? findDcm(raw.CADFile) : null;
      if (!entry) {
        notes.push(`${fileName}: ${text(raw.Name) || partId} 형상 파일이 없습니다.`);
      } else {
        try {
          part = { name: text(raw.Name), ...canonicalPart(trianglesFromHps(toBuffer(files.get(entry)))) };
        } catch (error) {
          if (!(error instanceof ScanbodyInputError)) throw error;
          notes.push(`${fileName}: ${text(raw.Name) || partId} — ${error.message}`);
        }
      }
    }
    partCache.set(partId, part);
    return part;
  };

  const ensureLib = (out, systemName, meta) => {
    const lib = out.get(systemName) ?? {
      source: "3shape",
      systemName,
      fileNames: [fileName],
      containerVersions: containerVersion ? [containerVersion] : [],
      parts: new Map(),
      kits: new Map(),
      meta: meta || {},
    };
    if (meta?.manufacturer && !lib.meta?.manufacturer) lib.meta = { ...lib.meta, ...meta };
    out.set(systemName, lib);
    return lib;
  };

  const putKit = (lib, kit) => {
    if (kit.scanAbutmentPartIds.length === 0) return;
    const partsKey = kit.scanAbutmentPartIds.join(",");
    for (const row of lib.kits.values()) {
      if (row.scanAbutmentPartIds.join(",") === partsKey) return;
    }
    let kitId = kit.kitId || `kit:${lib.kits.size}`;
    let n = 2;
    while (lib.kits.has(kitId)) {
      kitId = `${kit.kitId || "kit"}#${n}`;
      n += 1;
    }
    lib.kits.set(kitId, { ...kit, kitId });
  };

  const out = new Map();
  for (const obj of rawKitObjects) {
    const raw = objectProps(obj);
    const kitItem = itemKey(raw);
    const implantId = refId(raw.ImplantID);
    const systemId = implantId ? rawParts.get(implantId)?.ImplantSystemID : undefined;
    const system = (systemId && systemProps.get(systemId)) || [...systemProps.values()][0] || null;
    const systemName = text(system?.Name) || stripExt(baseName(fileName));
    const lib = ensureLib(out, systemName, systemMeta(system));
    const scanIds = [
      ...refCandidates(obj),
      ...extras.filter((row) => row.AbutmentKitID === kitItem).map((row) => refId(row.PartID)),
    ].filter(Boolean);
    const name = text(raw.Name);
    const kit = { kitId: kitItem, name: name || kitItem, scanAbutmentPartIds: [] };
    for (const id of scanIds) {
      const part = loadScanPart(id);
      if (!part) continue;
      attached.add(id);
      lib.parts.set(part.hash, part);
      if (!kit.scanAbutmentPartIds.includes(part.hash)) kit.scanAbutmentPartIds.push(part.hash);
    }
    putKit(lib, kit);
  }

  // 키트 기본 스캔바디 말고, 파일에 들어 있는 다른 직경·높이도 남긴다.
  for (const [partId, raw] of rawParts) {
    if (attached.has(partId) || PART_CLASS[raw.PartClass] !== "scanAbutment") continue;
    const part = loadScanPart(partId);
    if (!part) continue;
    const systemId = refId(raw.ImplantSystemID);
    const system = (systemId && systemProps.get(systemId)) || [...systemProps.values()][0] || null;
    const systemName = text(system?.Name) || stripExt(baseName(fileName));
    const lib = ensureLib(out, systemName, systemMeta(system));
    lib.parts.set(part.hash, part);
    putKit(lib, {
      kitId: `part:${partId}`,
      name: part.name || partId,
      scanAbutmentPartIds: [part.hash],
    });
  }
  const infoName = [...files.keys()].find((name) => /(^|\/)libraryimportinfo\.xml$/i.test(name));
  const info = infoName ? harvestLibraryMeta(parseXml(files.get(infoName), infoName)) : {};
  return collapseParsedLibraries([...out.values()], fileName, info);
}

// ─── exocad config.xml ─────────────────────────────────────────

function vec(node) {
  if (!node || typeof node !== "object") return null;
  const v = [Number(node.x), Number(node.y), Number(node.z)];
  return v.every(Number.isFinite) && Math.hypot(...v) > 1e-9 ? v : null;
}

function parseExocadEntry(configName, files, fileName, notes) {
  const doc = parseXml(files.get(configName), configName);
  const entry = doc?.ImplantLibraryEntry;
  if (!entry) return null;
  const dir = dirName(configName);
  const axis = vec(entry.AxisOcclusal) ?? [0, 0, 1];
  const entryRef = vec(entry.AxisAsymmetric) ?? [1, 0, 0];
  const keyword = text(entry.Keyword) || baseName(dir) || stripExt(fileName);
  const display = text(entry.DisplayInformation) || keyword;
  const xml = harvestLibraryMeta(entry);
  const identity = describeLibrary({ systemName: display, filePath: configName, meta: xml });
  const systemName = identity.title;

  const byLower = new Map([...files.keys()].map((name) => [name.toLowerCase(), name]));
  const partCache = new Map();
  const loadMarker = (marker, ref) => {
    const rel = normalizeEntryName(marker);
    const path = byLower.get((dir ? `${dir}/${rel}` : rel).toLowerCase());
    const cacheKey = `${path}|${ref.join(",")}`;
    if (partCache.has(cacheKey)) return partCache.get(cacheKey);
    let part = null;
    if (!path) {
      notes.push(`${systemName}: 스캔바디 ${marker} 파일이 없습니다.`);
    } else {
      try {
        const triangles = transformToModel(trianglesFromStl(toBuffer(files.get(path))), axis, ref);
        part = { name: stripExt(baseName(path)), ...canonicalPart(triangles) };
      } catch (error) {
        if (!(error instanceof ScanbodyInputError)) throw error;
        notes.push(`${systemName}: ${marker} — ${error.message}`);
      }
    }
    partCache.set(cacheKey, part);
    return part;
  };

  const lib = {
    source: "exocad",
    systemName,
    fileNames: [fileName],
    containerVersions: [],
    parts: new Map(),
    kits: new Map(),
    implantManufacturer: identity.manufacturer,
    brand: identity.brand,
    implantType: identity.implantType,
  };
  for (const type of entry.TypeConfig?.ImplantTypeConfig ?? []) {
    const typeKeyword = text(type.Keyword) || text(type.DisplayInformation);
    const typeName = text(type.DisplayInformation) || typeKeyword;
    const typeCode = splitScanbodyCode(typeKeyword || typeName);
    const kit = {
      kitId: [dir, keyword, typeKeyword].filter(Boolean).join(":"),
      name: typeCode.spec || typeName,
      spec: identity.spec || typeCode.spec || "",
      code: [keyword, typeKeyword].filter(Boolean).join("_"),
      scanAbutmentPartIds: [],
    };
    for (const sub of type.SubtypeConfig?.ImplantSubtypeConfig ?? []) {
      const marker = text(sub.MarkerFilename, 300);
      if (!marker) continue;
      if (!/\.stl$/i.test(marker)) {
        notes.push(`${systemName}: ${marker} — 암호화된 형상이라 읽을 수 없습니다.`);
        continue;
      }
      // 모델 +X = −AxisAsymmetric. GeoMedi 같은 스캔바디를 3Shape `.dme`와 비교하면 이 방향에서 겹친다.
      const asym = vec(sub.AxisAsymmetric) ?? entryRef;
      const part = loadMarker(marker, [-asym[0], -asym[1], -asym[2]]);
      if (!part) continue;
      lib.parts.set(part.hash, part);
      if (!kit.scanAbutmentPartIds.includes(part.hash)) kit.scanAbutmentPartIds.push(part.hash);
    }
    if (kit.scanAbutmentPartIds.length > 0) lib.kits.set(kit.kitId, kit);
  }
  return lib.kits.size > 0 ? lib : null;
}

// ─── 묶음 ─────────────────────────────────────────────────────

function mergeInto(merged, lib) {
  const prev = merged.get(lib.systemName);
  if (!prev) {
    merged.set(lib.systemName, lib);
    return;
  }
  for (const [hash, part] of lib.parts) prev.parts.set(hash, part);
  for (const [id, kit] of lib.kits) {
    const prevKit = prev.kits.get(id);
    if (!prevKit) {
      prev.kits.set(id, kit);
      continue;
    }
    for (const partId of kit.scanAbutmentPartIds) {
      if (!prevKit.scanAbutmentPartIds.includes(partId)) prevKit.scanAbutmentPartIds.push(partId);
    }
  }
  prev.fileNames = [...new Set([...prev.fileNames, ...lib.fileNames])];
  prev.containerVersions = [...new Set([...prev.containerVersions, ...lib.containerVersions])].sort();
  if (!prev.implantManufacturer) prev.implantManufacturer = lib.implantManufacturer || "";
  if (!prev.brand) prev.brand = lib.brand || "";
  if (!prev.implantType) prev.implantType = lib.implantType || "";
}

/**
 * 파일 이름마다 스캔바디 하나. .stl·.dcm·.stp를 축을 맞춰 모두 등록한다.
 * config.xml 옆의 .stl은 exocad 키트라 여기 넣지 않는다.
 */
async function meshLibrary(entries, label, notes) {
  const parts = new Map();
  const kits = new Map();
  const fileNames = [];
  for (const { name, bytes } of entries) {
    const partName = text(stripExt(baseName(name)) || "스캔바디", 80);
    try {
      const raw = await trianglesFromLibraryShape(toBuffer(bytes), name);
      const part = { name: partName, ...canonicalPart(alignScanbodyToModel(raw)) };
      parts.set(part.hash, part);
      let kitId = partName;
      let n = 2;
      while (kits.has(kitId)) {
        kitId = `${partName}#${n}`;
        n += 1;
      }
      kits.set(kitId, { kitId, name: partName, scanAbutmentPartIds: [part.hash] });
      fileNames.push(baseName(name));
    } catch (error) {
      if (!(error instanceof ScanbodyInputError)) throw error;
      notes.push(`${baseName(name)}: ${error.message}`);
    }
  }
  if (kits.size === 0) return null;
  const dirs = new Set(entries.map((entry) => dirName(entry.name)).filter(Boolean));
  let systemName = "스캔바디";
  if (dirs.size === 1) {
    const leaf = [...dirs][0].split("/").filter(Boolean).pop();
    if (leaf) systemName = text(leaf, 80);
  } else {
    const base = stripExt(baseName(label));
    if (base && !/^scanbody-meshes/i.test(base)) systemName = text(base, 80);
  }
  const identity = describeLibrary({ systemName, filePath: entries[0]?.name || label });
  return {
    source: "scan",
    systemName: identity.manufacturer || identity.brand ? identity.title : systemName,
    fileNames,
    containerVersions: [],
    parts,
    kits,
    implantManufacturer: identity.manufacturer,
    brand: identity.brand,
    implantType: identity.implantType,
  };
}

function dirHasConfig(name, files) {
  const dir = dirName(name).toLowerCase();
  const config = `${dir ? `${dir}/` : ""}config.xml`;
  for (const key of files.keys()) if (key.toLowerCase() === config) return true;
  return false;
}

/**
 * 업로드 묶음을 해석한다. `.dme`, `.zip`, `.stl`, `.stp`, `.dcm`.
 * @returns {Promise<{ libraries: Array<{ source, systemName, fileNames, containerVersions, parts: Map, kits: Map }>, notes: string[] }>}
 */
export async function parseScanbodyBundle(buffer, fileName) {
  if (buffer.length > SCANBODY_UPLOAD_LIMITS.maxUploadBytes) throw new ScanbodyInputError("파일이 너무 큽니다.");
  if (!isZip(buffer)) {
    const notes = [];
    if (!LIBRARY_SHAPE_PATTERN.test(fileName)) throw notFound(notes);
    const lib = await meshLibrary([{ name: fileName, bytes: buffer }], fileName, notes);
    if (!lib) throw notFound(notes);
    const libraries = finalize([lib]);
    if (libraries.length === 0) throw notFound(notes);
    return { libraries, notes };
  }
  const budget = { remaining: SCANBODY_UPLOAD_LIMITS.maxTotalBytes };
  const notes = [];
  const { files, ignored } = safeUnzip(buffer, {
    want: (name) =>
      /\.dme$/i.test(name) ||
      /(^|\/)materials\.xml$/i.test(name) ||
      /(^|\/)config\.xml$/i.test(name) ||
      LIBRARY_SHAPE_PATTERN.test(name),
    maxEntries: SCANBODY_UPLOAD_LIMITS.maxBundleEntries,
    maxEntryBytes: SCANBODY_UPLOAD_LIMITS.maxEntryBytes,
    budget,
    label: fileName,
  });

  // 단일 .dme를 그대로 올린 경우.
  if ([...files.keys()].some((name) => /(^|\/)materials\.xml$/i.test(name))) {
    const libraries = finalize(parseDmeFiles(files, fileName, notes));
    if (libraries.length === 0) throw notFound(notes);
    return { libraries, notes };
  }

  const merged = new Map();
  const dmeNames = [...files.keys()].filter((name) => /\.dme$/i.test(name));
  const dmeLibs = [];
  for (const name of dmeNames) {
    const bytes = files.get(name);
    if (!isZip(bytes)) {
      notes.push(`${baseName(name)}: .dme 형식이 아닙니다.`);
      continue;
    }
    try {
      dmeLibs.push(...parseDme(bytes, name, budget, notes));
    } catch (error) {
      if (!(error instanceof ScanbodyInputError)) throw error;
      notes.push(error.message);
    }
    files.delete(name);
  }
  // 버전 파일은 오래된 것부터 합친다. 같은 키트는 형상을 더하고, 다른 규격은 빼지 않는다.
  const newest = (lib) => lib.containerVersions.at(-1) ?? "";
  dmeLibs.sort((a, b) => newest(a).localeCompare(newest(b)));
  for (const lib of dmeLibs) mergeInto(merged, lib);

  for (const name of [...files.keys()].filter((n) => /(^|\/)config\.xml$/i.test(n))) {
    try {
      const lib = parseExocadEntry(name, files, fileName, notes);
      if (lib) mergeInto(merged, lib);
    } catch (error) {
      if (!(error instanceof ScanbodyInputError)) throw error;
      notes.push(error.message);
    }
  }

  const meshEntries = [];
  for (const [name, bytes] of files) {
    if (!LIBRARY_SHAPE_PATTERN.test(name)) continue;
    if (/\.stl$/i.test(name) && dirHasConfig(name, files)) continue;
    meshEntries.push({ name, bytes });
  }
  if (meshEntries.length > 0) {
    const lib = await meshLibrary(meshEntries, fileName, notes);
    if (lib) mergeInto(merged, lib);
  }

  const encrypted = ignored.filter((name) => /\.(sdfa|ipflib)$/i.test(name)).length;
  if (encrypted > 0) notes.push(`암호화된 형상(.sdfa·.ipflib) ${encrypted}개는 읽지 않았습니다.`);
  const nested = ignored.filter((name) => /\.(zip|7z|rar)$/i.test(name));
  if (nested.length > 0) notes.push(`압축 안의 압축 파일 ${nested.length}개는 풀지 않았습니다. 풀어서 다시 올려 주세요.`);

  const libraries = finalize([...merged.values()]);
  if (libraries.length === 0) throw notFound(notes);
  return { libraries, notes };
}

/**
 * 기공소가 스캔하거나 다른 CAD에서 내보낸 스캔바디 형상 한 개(.dcm·.stl·.ply·.obj).
 * 축·플랫폼(frame)은 브라우저가 템플릿과 같은 방법으로 계산해 보낸다. 형상은 서버가 원본에서 다시 읽는다.
 * 의뢰 제조사·규격을 키트 이름으로 둔다(같은 규격을 다시 올리면 그 키트를 바꾼다).
 */
export function parseScanbodyMesh(buffer, fileName, meta) {
  if (buffer.length > SCANBODY_UPLOAD_LIMITS.maxEntryBytes) throw new ScanbodyInputError("파일이 너무 큽니다.");
  const maker = text(meta?.manufacturer, 60);
  if (!maker) throw new ScanbodyInputError("스캔바디 제조사가 없습니다.");
  const triangles = frameToModel(trianglesFromMeshFile(buffer, fileName), meta.frame);
  const part = { name: stripExt(baseName(fileName)), ...canonicalPart(triangles) };
  const size = [text(meta?.diameter, 10), text(meta?.height, 10)].filter(Boolean).join("/");
  const kitId = `${maker} ${size}`.trim();
  const lib = {
    source: "scan",
    systemName: `${maker} 스캔바디`,
    fileNames: [fileName],
    containerVersions: [],
    parts: new Map([[part.hash, part]]),
    kits: new Map([[kitId, { kitId, name: kitId, scanAbutmentPartIds: [part.hash] }]]),
  };
  return { libraries: [lib], notes: [] };
}

function notFound(notes) {
  const detail = notes.slice(0, 2).join(" ");
  return new ScanbodyInputError(
    `스캔바디 라이브러리를 찾지 못했습니다. 3Shape .dme 또는 exocad 라이브러리 폴더를 올려 주세요.${detail ? ` (${detail})` : ""}`,
  );
}

function finalize(libraries) {
  return libraries
    .map((lib) => {
      for (const [id, kit] of [...lib.kits]) if (kit.scanAbutmentPartIds.length === 0) lib.kits.delete(id);
      const used = new Set([...lib.kits.values()].flatMap((kit) => kit.scanAbutmentPartIds));
      for (const hash of [...lib.parts.keys()]) if (!used.has(hash)) lib.parts.delete(hash);
      return lib;
    })
    .filter((lib) => lib.kits.size > 0 && lib.parts.size > 0);
}
