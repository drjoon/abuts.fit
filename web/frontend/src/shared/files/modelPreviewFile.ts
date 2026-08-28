// change-log:
// - 2026-08-28: BiteScan 등 TextureFile·UV 대소문자·스캔토큰 매칭 강화. 스캔 칼라는 언릿(Basic)으로 밝게.
// - 2026-08-28: PLY TextureFile·UV 텍스처 / 컬러 프로퍼티명 정규화 / OBJ MTL map_Kd 지원. 스캔 칼라는 언릿(Basic)으로 밝게.
// - 2026-08-28: PLY/OBJ 버텍스 컬러가 있으면 MeshStandardMaterial.vertexColors로 표시.
// - 2026-08-23: STL/PLY/OBJ geometry 파서를 썸네일·뷰어 공용으로 분리.
// - 2026-08-11: STL/PLY/OBJ 프리뷰용 File 래핑(확장자→MIME) 헬퍼 추가.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/features/requests/components/StlPreviewViewer.tsx
// - web/frontend/src/features/requests/components/StlPreviewThumbnail.tsx
// - web/frontend/src/shared/components/ModelPreviewDialog.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const MODEL_PREVIEW_EXTENSIONS = [".stl", ".ply", ".obj"] as const;

/** STL 기본(무색) 프리뷰 틴트. PLY/OBJ 칼라/텍스처가 있으면 쓰지 않는다. */
const DEFAULT_PREVIEW_COLOR = 0x5b9dff;

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|bmp|gif)$/i;

export function getModelExtLower(name: string): string {
  const lower = String(name || "").trim().toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return "";
  return lower.slice(dot);
}

export function isModelPreviewExt(ext: string): boolean {
  return (MODEL_PREVIEW_EXTENSIONS as readonly string[]).includes(
    String(ext || "").toLowerCase(),
  );
}

export function mimeTypeForModelFileName(name: string): string {
  const ext = getModelExtLower(name);
  if (ext === ".ply") return "model/ply";
  if (ext === ".obj") return "model/obj";
  return "model/stl";
}

/** path/filePath에서 basename만 추출. 비면 fallback. */
export function modelFileBasename(
  pathOrName: unknown,
  fallback = "model.stl",
): string {
  const raw = String(pathOrName || "").trim();
  if (!raw) return fallback;
  const base = raw.split("/").pop() || raw;
  return base.trim() || fallback;
}

export function fileStemLower(name: string): string {
  const base = modelFileBasename(name, "").toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * Blob을 StlPreviewViewer가 확장자로 로더를 고를 수 있게 File로 감싼다.
 * MIME은 blob이 비어 있거나 octet-stream일 때 파일명 확장자로 보정한다.
 */
export function fileFromModelBlob(blob: Blob, fileName: string): File {
  const name = modelFileBasename(fileName, "model.stl");
  const blobType = String(blob?.type || "").trim().toLowerCase();
  const type =
    blobType && blobType !== "application/octet-stream"
      ? blob.type
      : mimeTypeForModelFileName(name);
  return new File([blob], name, { type });
}

export function fileFromImageBlob(blob: Blob, fileName: string): File {
  const name = modelFileBasename(fileName, "texture.png");
  const blobType = String(blob?.type || "").trim().toLowerCase();
  const ext = getModelExtLower(name);
  const fallback =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : ext === ".bmp"
            ? "image/bmp"
            : "image/jpeg";
  const type =
    blobType && blobType !== "application/octet-stream" ? blob.type : fallback;
  return new File([blob], name, { type });
}

/** geometry에 버텍스 컬러(스캔 칼라)가 있는지 */
export function geometryHasVertexColors(
  geometry: THREE.BufferGeometry | null | undefined,
): boolean {
  if (!geometry) return false;
  const color = geometry.getAttribute("color");
  return Boolean(color && color.count > 0);
}

export function geometryHasUv(
  geometry: THREE.BufferGeometry | null | undefined,
): boolean {
  if (!geometry) return false;
  const uv = geometry.getAttribute("uv");
  return Boolean(uv && uv.count > 0);
}

/**
 * 썸네일·뷰어 공용 메시 머티리얼.
 * 우선순위: 텍스처 map → 버텍스 컬러 → STL 파란 틴트.
 * 스캔 칼라/텍스처는 조명에 어두워지지 않게 MeshBasic(언릿)으로 표시.
 */
export function createModelPreviewMaterial(
  geometry: THREE.BufferGeometry,
  texture?: THREE.Texture | null,
): THREE.MeshStandardMaterial | THREE.MeshBasicMaterial {
  const hasMap = Boolean(texture);
  const hasColor = !hasMap && geometryHasVertexColors(geometry);
  if (hasMap || hasColor) {
    return new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: hasMap ? texture! : null,
      vertexColors: hasColor,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: DEFAULT_PREVIEW_COLOR,
    metalness: 0.08,
    roughness: 0.6,
  });
}

/** 스캔 칼라/텍스처 프리뷰인지 — 톤매핑·노출 보정용 */
export function isScanColorPreview(
  geometry: THREE.BufferGeometry,
  texture?: THREE.Texture | null,
): boolean {
  return Boolean(texture) || geometryHasVertexColors(geometry);
}

export async function loadTextureFromFile(
  file: File,
): Promise<THREE.Texture> {
  const url = URL.createObjectURL(file);
  try {
    const texture = await new THREE.TextureLoader().loadAsync(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    // PLY/OBJ 스캔 UV는 OpenGL(origin bottom-left)인 경우가 많아 flipY=false.
    texture.flipY = false;
    texture.needsUpdate = true;
    return texture;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** PLY 헤더(최대 ~256KB)에서 TextureFile·프로퍼티명을 읽는다. */
export function peekPlyHeaderInfo(buffer: ArrayBuffer): {
  textureFileName: string | null;
  propertyNames: string[];
  headerText: string;
} {
  const bytes = new Uint8Array(buffer);
  const max = Math.min(bytes.length, 256 * 1024);
  let headerEnd = -1;
  const marker = "end_header";
  // ASCII 헤더만 스캔
  let text = "";
  {
    const slice = bytes.subarray(0, max);
    text = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    const idx = text.indexOf(marker);
    if (idx >= 0) {
      headerEnd = idx + marker.length;
      // include trailing newline(s)
      let end = headerEnd;
      while (end < text.length && (text[end] === "\r" || text[end] === "\n")) {
        end += 1;
      }
      text = text.slice(0, end);
    } else {
      text = text.slice(0, Math.min(text.length, 8 * 1024));
    }
  }

  let textureFileName: string | null = null;
  const propertyNames: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    if (lower.startsWith("comment") && lower.includes("texturefile")) {
      const at = lower.indexOf("texturefile");
      const name = line.slice(at + "texturefile".length).trim();
      if (name) textureFileName = modelFileBasename(name, name);
      continue;
    }
    if (lower.startsWith("property")) {
      const parts = line.split(/\s+/);
      // property <type> <name> | property list <countType> <itemType> <name>
      const name =
        parts[1]?.toLowerCase() === "list"
          ? parts[4]
          : parts.length >= 3
            ? parts[parts.length - 1]
            : "";
      if (name) propertyNames.push(name);
    }
  }

  return { textureFileName, propertyNames, headerText: text };
}

/**
 * Medit 등 스캔 종류 토큰. "박성혜 BiteScan" / "BiteScan" → bitescan
 */
export function scanKindToken(name: string): string {
  const stem = fileStemLower(name).replace(/[\s_-]+/g, "");
  const tokens = [
    "upperjawscan",
    "lowerjawscan",
    "bitescan",
    "preopscan",
    "upperjaw",
    "lowerjaw",
    "bite",
  ];
  for (const token of tokens) {
    if (stem.includes(token)) return token;
  }
  return stem;
}

/**
 * PLYLoader가 인식하는 red/green/blue·texture_u/v 로 프로퍼티명을 맞춘다.
 * (Red, ambient_red, texture_U 등 스캐너별 표기 보정)
 */
function buildPlyPropertyMapping(
  propertyNames: string[],
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const find = (...cands: string[]) =>
    propertyNames.find((n) => cands.includes(n.toLowerCase()));

  const red = find(
    "red",
    "diffuse_red",
    "ambient_red",
    "r",
    "diffuse_r",
    "ambient_r",
  );
  const green = find(
    "green",
    "diffuse_green",
    "ambient_green",
    "g",
    "diffuse_g",
    "ambient_g",
  );
  const blue = find(
    "blue",
    "diffuse_blue",
    "ambient_blue",
    "b",
    "diffuse_b",
    "ambient_b",
  );

  if (red && red.toLowerCase() !== "red") mapping[red] = "red";
  if (green && green.toLowerCase() !== "green") mapping[green] = "green";
  if (blue && blue.toLowerCase() !== "blue") mapping[blue] = "blue";

  for (const n of propertyNames) {
    const lower = n.toLowerCase();
    if (lower === "red" && n !== "red") mapping[n] = "red";
    if (lower === "green" && n !== "green") mapping[n] = "green";
    if (lower === "blue" && n !== "blue") mapping[n] = "blue";

    // UV — PLYLoader는 소문자 이름만 찾는다.
    if (
      (lower === "texture_u" ||
        lower === "texture_v" ||
        lower === "texture_s" ||
        lower === "texture_t" ||
        lower === "s" ||
        lower === "t" ||
        lower === "u" ||
        lower === "v" ||
        lower === "tx" ||
        lower === "ty") &&
      n !== lower
    ) {
      if (lower === "texture_s") mapping[n] = "texture_u";
      else if (lower === "texture_t") mapping[n] = "texture_v";
      else mapping[n] = lower;
    }
  }

  return mapping;
}

/**
 * 모델과 같이 올라온 이미지 중 텍스처 후보를 고른다.
 * 1) PLY TextureFile / OBJ map_Kd 정확·stem 일치
 * 2) 모델과 동일 stem (UpperJawScan.ply → UpperJawScan.jpg)
 * 3) BiteScan / LowerJawScan 등 스캔 토큰 일치
 * 4) stem 포함
 */
export function resolveCompanionTextureFileName(
  modelFileName: string,
  preferredTextureName: string | null | undefined,
  candidateFileNames: string[],
): string | null {
  const candidates = (candidateFileNames || [])
    .map((n) => String(n || "").trim())
    .filter((n) => n && IMAGE_EXT_RE.test(n));
  if (!candidates.length) return null;

  const byBase = new Map<string, string>();
  for (const name of candidates) {
    byBase.set(modelFileBasename(name).toLowerCase(), name);
  }

  const preferred = preferredTextureName
    ? modelFileBasename(preferredTextureName).toLowerCase()
    : "";
  if (preferred && byBase.has(preferred)) return byBase.get(preferred)!;

  if (preferred) {
    const preferredStem = fileStemLower(preferred);
    const byPreferredStem = candidates.find(
      (n) => fileStemLower(n) === preferredStem,
    );
    if (byPreferredStem) return byPreferredStem;
    const preferredToken = scanKindToken(preferred);
    if (preferredToken) {
      const byPreferredToken = candidates.find(
        (n) => scanKindToken(n) === preferredToken,
      );
      if (byPreferredToken) return byPreferredToken;
    }
    const fuzzyPreferred = candidates.find((n) => {
      const s = fileStemLower(n);
      return s.includes(preferredStem) || preferredStem.includes(s);
    });
    if (fuzzyPreferred) return fuzzyPreferred;
  }

  const stem = fileStemLower(modelFileName);
  if (stem) {
    const exactStem = candidates.find((n) => fileStemLower(n) === stem);
    if (exactStem) return exactStem;
  }

  const modelToken = scanKindToken(modelFileName);
  if (modelToken) {
    const byToken = candidates.find((n) => scanKindToken(n) === modelToken);
    if (byToken) return byToken;
  }

  if (stem) {
    const fuzzy = candidates.find((n) => {
      const s = fileStemLower(n);
      return s.includes(stem) || stem.includes(s);
    });
    if (fuzzy) return fuzzy;
  }

  return null;
}

/** 모델 S3 키와 같은 폴더의 TextureFile 키 추정 */
export function siblingTextureS3Key(
  modelS3Key: string,
  textureFileName: string,
): string | null {
  const key = String(modelS3Key || "").trim();
  const tex = modelFileBasename(textureFileName);
  if (!key || !tex) return null;
  const slash = key.lastIndexOf("/");
  if (slash < 0) return tex;
  return `${key.slice(0, slash + 1)}${tex}`;
}

function peekObjMaterialRefs(objText: string): {
  mtlFileName: string | null;
  mapKdNames: string[];
} {
  let mtlFileName: string | null = null;
  const mapKdNames: string[] = [];
  for (const rawLine of objText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const tag = (parts[0] || "").toLowerCase();
    if (tag === "mtllib" && parts[1]) {
      mtlFileName = modelFileBasename(parts.slice(1).join(" "));
    }
  }
  return { mtlFileName, mapKdNames };
}

function peekMtlMapKdNames(mtlText: string): string[] {
  const names: string[] = [];
  for (const rawLine of mtlText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    if ((parts[0] || "").toLowerCase() === "map_kd" && parts[1]) {
      names.push(modelFileBasename(parts.slice(1).join(" ")));
    }
  }
  return names;
}

export type ParseModelPreviewOptions = {
  /** PLY TextureFile / OBJ map_Kd 에 대응하는 이미지 */
  textureFile?: File | null;
  /** MTL 등 부가 파일 (이름으로 매칭) */
  companionFiles?: File[] | null;
};

export type ParsedModelPreview = {
  geometry: THREE.BufferGeometry;
  texture: THREE.Texture | null;
  textureFileName: string | null;
};

/**
 * STL/PLY/OBJ → geometry (+ optional texture).
 * 텍스처는 options.textureFile 또는 companionFiles에서 해석한다.
 */
export async function parseModelPreview(
  file: File,
  options: ParseModelPreviewOptions = {},
): Promise<ParsedModelPreview> {
  const buffer = await file.arrayBuffer();
  const ext = getModelExtLower(file.name);
  const companionFiles = Array.isArray(options.companionFiles)
    ? options.companionFiles
    : [];
  const companionByBase = new Map<string, File>();
  for (const f of companionFiles) {
    companionByBase.set(modelFileBasename(f.name).toLowerCase(), f);
  }

  const resolveTextureFile = (
    preferred: string | null,
  ): File | null => {
    if (options.textureFile) return options.textureFile;
    const matchedName = resolveCompanionTextureFileName(
      file.name,
      preferred,
      companionFiles.map((f) => f.name),
    );
    if (!matchedName) return null;
    return (
      companionByBase.get(modelFileBasename(matchedName).toLowerCase()) || null
    );
  };

  if (ext === ".ply") {
    const header = peekPlyHeaderInfo(buffer);
    const loader = new PLYLoader();
    const mapping = buildPlyPropertyMapping(header.propertyNames);
    if (Object.keys(mapping).length > 0) {
      loader.setPropertyNameMapping(mapping);
    }
    const geometry = loader.parse(buffer);
    normalizeVertexColorsIfNeeded(geometry);

    let texture: THREE.Texture | null = null;
    const texFile = resolveTextureFile(header.textureFileName);
    if (texFile && geometryHasUv(geometry)) {
      try {
        texture = await loadTextureFromFile(texFile);
      } catch {
        texture = null;
      }
    }

    if (import.meta.env.DEV) {
      console.info("[modelPreview][ply]", {
        file: file.name,
        attrs: Object.keys(geometry.attributes),
        textureFileName: header.textureFileName,
        mapped: mapping,
        hasTexture: Boolean(texture),
      });
    }

    return {
      geometry,
      texture,
      textureFileName: header.textureFileName,
    };
  }

  if (ext === ".obj") {
    const text = new TextDecoder().decode(buffer);
    const { mtlFileName } = peekObjMaterialRefs(text);
    let preferredTex: string | null = null;
    let materials: ReturnType<MTLLoader["parse"]> | null = null;

    if (mtlFileName) {
      const mtlFile =
        companionByBase.get(modelFileBasename(mtlFileName).toLowerCase()) ||
        null;
      if (mtlFile) {
        const mtlText = await mtlFile.text();
        const mapKds = peekMtlMapKdNames(mtlText);
        preferredTex = mapKds[0] || null;
        try {
          const mtlLoader = new MTLLoader();
          materials = mtlLoader.parse(mtlText, "");
          materials.preload();
        } catch {
          materials = null;
        }
      }
    }

    const objLoader = new OBJLoader();
    if (materials) objLoader.setMaterials(materials);
    const group = objLoader.parse(text);
    group.updateMatrixWorld(true);

    // Prefer texture from MTL map_Kd / explicit textureFile.
    let texture: THREE.Texture | null = null;
    const texFile = resolveTextureFile(preferredTex);
    if (texFile) {
      try {
        texture = await loadTextureFromFile(texFile);
      } catch {
        texture = null;
      }
    }

    // If OBJLoader already attached maps on mesh materials, steal the first.
    if (!texture) {
      group.traverse((child) => {
        if (texture) return;
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = mesh.material as THREE.MeshPhongMaterial;
        if (mat && !Array.isArray(mat) && mat.map) {
          texture = mat.map;
        }
      });
    }

    const parts: THREE.BufferGeometry[] = [];
    group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const geo = mesh.geometry.clone();
      geo.applyMatrix4(mesh.matrixWorld);
      parts.push(geo);
    });
    if (parts.length === 0) {
      throw new Error("OBJ에 표시할 메시가 없습니다.");
    }

    let geometry: THREE.BufferGeometry;
    if (parts.length === 1) {
      geometry = parts[0]!;
    } else {
      const anyColor = parts.some((g) => geometryHasVertexColors(g));
      const anyUv = parts.some((g) => geometryHasUv(g));
      if (anyColor) {
        for (const g of parts) {
          if (geometryHasVertexColors(g)) continue;
          const pos = g.getAttribute("position");
          if (!pos) continue;
          const colors = new Float32Array(pos.count * 3);
          colors.fill(1);
          g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        }
      }
      if (anyUv) {
        for (const g of parts) {
          if (geometryHasUv(g)) continue;
          const pos = g.getAttribute("position");
          if (!pos) continue;
          g.setAttribute(
            "uv",
            new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2),
          );
        }
      }
      const merged = mergeGeometries(parts, false);
      if (!merged) throw new Error("OBJ 메시를 합치지 못했습니다.");
      geometry = merged;
    }

    normalizeVertexColorsIfNeeded(geometry);

    // Texture without UV is useless for MeshStandardMaterial.map
    if (texture && !geometryHasUv(geometry)) {
      // keep texture only if UVs exist; otherwise rely on vertex colors
      if (!geometryHasVertexColors(geometry)) {
        // still attach — some pipelines use equirect; for dental scans UV is required
      }
    }
    if (texture && !geometryHasUv(geometry)) {
      texture = null;
    }

    if (import.meta.env.DEV) {
      console.info("[modelPreview][obj]", {
        file: file.name,
        attrs: Object.keys(geometry.attributes),
        mtlFileName,
        preferredTex,
        hasTexture: Boolean(texture),
      });
    }

    return { geometry, texture, textureFileName: preferredTex };
  }

  return {
    geometry: new STLLoader().parse(buffer),
    texture: null,
    textureFileName: null,
  };
}

/**
 * float 0..1 컬러를 PLYLoader가 /255 한 뒤 sRGB→linear 한 경우(거의 검정)를 복구한다.
 * uchar 경로(정상, max≈1)는 건드리지 않는다.
 */
function normalizeVertexColorsIfNeeded(geometry: THREE.BufferGeometry) {
  const color = geometry.getAttribute("color") as THREE.BufferAttribute | null;
  if (!color || color.count <= 0) return;
  let max = 0;
  const arr = color.array as ArrayLike<number>;
  for (let i = 0; i < arr.length; i += 1) {
    const v = Number(arr[i]);
    if (Number.isFinite(v) && v > max) max = v;
  }
  // PLYLoader는 항상 /255 후 SRGBColorSpace 변환. float 0..1이면 max ≪ 0.02.
  if (!(max > 0 && max <= 0.02)) return;

  const tmp = new THREE.Color();
  for (let i = 0; i < color.count; i += 1) {
    // stored = linear(sRGB(c/255))
    tmp.setRGB(
      color.getX(i),
      color.getY(i),
      color.getZ(i),
      THREE.LinearSRGBColorSpace,
    );
    tmp.convertLinearToSRGB(); // ≈ c/255
    const r = Math.min(1, Math.max(0, tmp.r * 255));
    const g = Math.min(1, Math.max(0, tmp.g * 255));
    const b = Math.min(1, Math.max(0, tmp.b * 255));
    tmp.setRGB(r, g, b, THREE.SRGBColorSpace); // → linear(sRGB(c))
    color.setXYZ(i, tmp.r, tmp.g, tmp.b);
  }
  color.needsUpdate = true;
}

/** STL/PLY/OBJ File → BufferGeometry (하위 호환) */
export async function parseModelGeometry(
  file: File,
  options?: ParseModelPreviewOptions,
): Promise<THREE.BufferGeometry> {
  const parsed = await parseModelPreview(file, options);
  // texture는 호출측에서 parseModelPreview를 쓰도록. 여기선 geometry만.
  parsed.texture?.dispose?.();
  return parsed.geometry;
}

/**
 * 모델 버퍼만으로 TextureFile 이름을 먼저 알고 싶을 때 (동반 이미지 fetch용).
 */
export async function peekModelTextureFileName(
  file: File,
): Promise<string | null> {
  const ext = getModelExtLower(file.name);
  const buffer = await file.arrayBuffer();
  if (ext === ".ply") {
    return peekPlyHeaderInfo(buffer).textureFileName;
  }
  if (ext === ".obj") {
    const text = new TextDecoder().decode(buffer);
    const { mtlFileName } = peekObjMaterialRefs(text);
    return mtlFileName;
  }
  return null;
}
