// 3Shape `.dme` 스캔바디 라이브러리 → 임플란트 시스템·키트·부품(.dcm).
// `.dme`는 ZIP이고 Materials.xml에 부품 목록과 키트 연결이 평문으로 있다.
// ZIP 안 경로는 버전마다 구분자가 섞여 풀리므로 CADFile 경로 끝과 파일 이름으로 찾는다.
// 연도별 호환 파일(16v~24v)은 같은 라이브러리지만 ItemID가 파일마다 달라서,
// 부품 id는 형상 해시, 키트 id는 키트 이름으로 쓰고 시스템 이름으로 합친다.
// related files:
// - web/backend/controllers/scanbodyLibraries/scanbodyLibrary.controller.js (hashDcmGeometry)
// - web/frontend/src/shared/practice/scanbodyLibraryApi.ts

export type ScanbodyPartClass =
  | "scanAbutment"
  | "implant"
  | "screw"
  | "base"
  | "blank"
  | "analogInterface"
  | "interface"
  | "other";

export type DmePart = {
  /** 형상 해시와 같다. */
  partId: string;
  name: string;
  partClass: ScanbodyPartClass;
  hash: string;
  file: Blob;
};

export type DmeKit = {
  /** 키트 이름. */
  kitId: string;
  name: string;
  implantPartId: string | null;
  scanAbutmentPartIds: string[];
  screwPartId: string | null;
  basePartId: string | null;
  blankPartId: string | null;
};

export type DmeLibrary = {
  systemName: string;
  fileNames: string[];
  containerVersions: string[];
  parts: DmePart[];
  kits: DmeKit[];
  /** CADFile을 ZIP에서 찾지 못한 부품 이름. */
  missing: string[];
};

const PART_CLASS: Record<string, ScanbodyPartClass> = {
  ispScanAbutment: "scanAbutment",
  ispImplant: "implant",
  ispScrew: "screw",
  ispBase: "base",
  ispBlank: "blank",
  ispAnalogInterface: "analogInterface",
  ispInterface: "interface",
};

function props(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const child of Array.from(el.children)) {
    if (child.tagName !== "Property" && child.tagName !== "String") continue;
    const name = child.getAttribute("name");
    if (name) out[name] = child.getAttribute("value") ?? "";
  }
  return out;
}

function ref(value: string | undefined): string | null {
  const v = String(value || "").trim();
  return v && v !== "_NULL_" ? v : null;
}

function itemKey(p: Record<string, string>) {
  return `${p.CreatorSiteID ?? ""}_${p.ItemID ?? ""}`;
}

function normPath(path: string) {
  return path
    .replace(/^:[A-Z]+:/i, "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\//, "")
    .toLowerCase();
}

function baseName(path: string) {
  return path.split("/").pop() ?? path;
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 서버 hashDcmGeometry와 같은 규칙. */
export async function hashDcmGeometry(bytes: Uint8Array): Promise<string> {
  const xml = new TextDecoder().decode(bytes);
  let source: Uint8Array = bytes;
  if (/<HPS[\s>]/i.test(xml)) {
    const vertices = /<Vertices\b[^>]*>([\s\S]*?)<\/Vertices>/i.exec(xml)?.[1];
    const facets = /<Facets\b[^>]*>([\s\S]*?)<\/Facets>/i.exec(xml)?.[1];
    if (vertices && facets) {
      source = new TextEncoder().encode(
        `${vertices.replace(/\s+/g, "")}|${facets.replace(/\s+/g, "")}`,
      );
    }
  }
  return toHex(await crypto.subtle.digest("SHA-256", source));
}

async function parseOneDme(file: File): Promise<DmeLibrary[]> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.keys(zip.files)
    .map((name) => zip.files[name]!)
    .filter((entry) => !entry.dir);
  const materials = entries.find((entry) => /(^|[\\/])materials\.xml$/i.test(entry.name));
  if (!materials) throw new Error(`${file.name}: Materials.xml이 없습니다.`);
  const xml = new DOMParser().parseFromString(await materials.async("string"), "application/xml");
  if (xml.querySelector("parsererror")) throw new Error(`${file.name}: Materials.xml을 읽지 못했습니다.`);
  const containerVersion = xml.documentElement.getAttribute("version") ?? "";

  const byType = (type: string) =>
    Array.from(xml.querySelectorAll(`Object[type="${type}"]`))
      .map(props)
      .filter((p) => p.InRecycleBin !== "True");

  const systems = new Map(byType("TDM_Item_ImplantSystem").map((p) => [itemKey(p), p.Name ?? ""]));
  const rawParts = new Map(byType("TDM_Item_ImplantSystemPart").map((p) => [itemKey(p), p]));
  const rawKits = byType("TDM_Item_AbutmentKit");
  const extras = byType("TDM_Item_AbutmentKitImplantPartExtraRelation");

  const zipByPath = new Map(entries.map((entry) => [normPath(entry.name), entry]));
  const findEntry = (cadFile: string) => {
    const want = normPath(cadFile);
    const exact = zipByPath.get(want);
    if (exact) return exact;
    for (const [path, entry] of zipByPath) if (want.endsWith(`/${path}`) || path.endsWith(want)) return entry;
    const name = baseName(want);
    for (const [path, entry] of zipByPath) if (baseName(path) === name) return entry;
    return null;
  };

  const out = new Map<string, DmeLibrary>();
  const partCache = new Map<string, DmePart | null>();
  const loadPart = async (partId: string | null, missing: string[]) => {
    if (!partId) return null;
    if (partCache.has(partId)) return partCache.get(partId) ?? null;
    const raw = rawParts.get(partId);
    const entry = raw?.CADFile ? findEntry(raw.CADFile) : null;
    if (!raw || !entry) {
      if (raw) missing.push(raw.Name ?? partId);
      partCache.set(partId, null);
      return null;
    }
    const bytes = await entry.async("uint8array");
    const hash = await hashDcmGeometry(bytes);
    const part: DmePart = {
      partId: hash,
      name: raw.Name ?? "",
      partClass: PART_CLASS[raw.PartClass ?? ""] ?? "other",
      hash,
      file: new Blob([bytes], { type: "application/octet-stream" }),
    };
    partCache.set(partId, part);
    return part;
  };

  for (const raw of rawKits) {
    const itemId = itemKey(raw);
    const implantId = ref(raw.ImplantID);
    const systemId = implantId ? rawParts.get(implantId)?.ImplantSystemID : undefined;
    const systemName =
      (systemId && systems.get(systemId)) || [...systems.values()][0] || file.name.replace(/\.dme$/i, "");
    const lib =
      out.get(systemName) ??
      ({
        systemName,
        fileNames: [file.name],
        containerVersions: containerVersion ? [containerVersion] : [],
        parts: [],
        kits: [],
        missing: [],
      } satisfies DmeLibrary);
    out.set(systemName, lib);

    const scanIds = [
      ref(raw.ScanAbutmentID),
      ...extras.filter((row) => row.AbutmentKitID === itemId).map((row) => ref(row.PartID)),
    ].filter((id): id is string => Boolean(id));
    const hashOf = async (id: string | null) => (await loadPart(id, lib.missing))?.partId ?? null;
    const name = (raw.Name ?? "").trim();
    const kit: DmeKit = {
      kitId: name || itemId,
      name,
      implantPartId: await hashOf(implantId),
      scanAbutmentPartIds: [],
      screwPartId: await hashOf(ref(raw.ScrewID)),
      basePartId: await hashOf(ref(raw.BaseID)),
      blankPartId: await hashOf(ref(raw.BlankID)),
    };
    for (const id of scanIds) {
      const part = await loadPart(id, lib.missing);
      if (part?.partClass === "scanAbutment" && !kit.scanAbutmentPartIds.includes(part.partId)) {
        kit.scanAbutmentPartIds.push(part.partId);
      }
    }
    if (!lib.kits.some((row) => row.kitId === kit.kitId)) lib.kits.push(kit);
  }

  for (const lib of out.values()) {
    const used = new Set(
      lib.kits.flatMap((kit) => [
        ...kit.scanAbutmentPartIds,
        kit.implantPartId,
        kit.screwPartId,
        kit.basePartId,
        kit.blankPartId,
      ]),
    );
    const parts = new Map<string, DmePart>();
    for (const part of partCache.values()) {
      if (part && used.has(part.partId) && !parts.has(part.partId)) parts.set(part.partId, part);
    }
    lib.parts = [...parts.values()];
  }
  return [...out.values()];
}

/** 여러 `.dme`를 읽어 시스템 이름으로 합친다. 같은 이름의 키트는 최신 Dental System 파일 것을 쓴다. */
export async function parseDmeFiles(files: readonly File[]): Promise<DmeLibrary[]> {
  const merged = new Map<string, DmeLibrary>();
  const parsed = (await Promise.all(files.map(parseOneDme))).flat();
  const newest = (lib: DmeLibrary) => lib.containerVersions.at(-1) ?? "";
  parsed.sort((a, b) => newest(a).localeCompare(newest(b)));
  for (const lib of parsed) {
    const prev = merged.get(lib.systemName);
    if (!prev) {
      merged.set(lib.systemName, lib);
      continue;
    }
    const parts = new Map(prev.parts.map((part) => [part.partId, part]));
    for (const part of lib.parts) parts.set(part.partId, part);
    const kits = new Map(prev.kits.map((kit) => [kit.kitId, kit]));
    for (const kit of lib.kits) kits.set(kit.kitId, kit);
    merged.set(lib.systemName, {
      systemName: lib.systemName,
      fileNames: [...new Set([...prev.fileNames, ...lib.fileNames])],
      containerVersions: [...new Set([...prev.containerVersions, ...lib.containerVersions])].sort(),
      parts: [...parts.values()],
      kits: [...kits.values()],
      missing: [...new Set([...prev.missing, ...lib.missing])].filter(
        (name) => ![...parts.values()].some((part) => part.name === name),
      ),
    });
  }
  return [...merged.values()];
}

/** 업로드 폼. 같은 형상은 파일 하나만 보낸다. */
export function dmeLibraryFormData(lib: DmeLibrary, catalogIdsByKit: Record<string, string[]> = {}) {
  const form = new FormData();
  const files = new Map<string, Blob>();
  for (const part of lib.parts) files.set(part.hash, part.file);
  form.append(
    "meta",
    JSON.stringify({
      systemName: lib.systemName,
      fileNames: lib.fileNames,
      containerVersions: lib.containerVersions,
      parts: lib.parts.map((part) => ({
        partId: part.partId,
        name: part.name,
        partClass: part.partClass,
        file: `${part.hash}.dcm`,
      })),
      kits: lib.kits.map((kit) => ({ ...kit, catalogIds: catalogIdsByKit[kit.kitId] ?? [] })),
    }),
  );
  for (const [hash, blob] of files) form.append("files", blob, `${hash}.dcm`);
  return form;
}
