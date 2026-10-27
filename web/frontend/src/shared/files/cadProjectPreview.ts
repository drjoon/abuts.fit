// ExoCAD .dentalProject / 3Shape .3ox·.3oxz 를 뷰어가 읽는 스캔 파일로 푼다.
// .3oxz(와 zip인 .3ox) 안의 STL·PLY·OBJ·DCM을 꺼낸다. XML 프로젝트는 형상이 없다.
// related files:
// - web/frontend/src/shared/files/modelPreviewFile.ts
// - web/frontend/src/shared/components/RequestFilesPreviewDialog.tsx
// - web/frontend/src/shared/practice/practiceTransferAccept.ts
// - web/frontend/src/shared/practice/labProsthesisAiDesign.ts

import { classifyOralScanFileName } from "@/shared/practice/labProsthesisAiDesign";
import {
  fileFromImageBlob,
  getModelExtLower,
  mimeTypeForModelFileName,
} from "@/shared/files/modelPreviewFile";

const MESH_EXT = new Set([".stl", ".ply", ".obj", ".dcm"]);
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"]);
const MAX_ENTRY_BYTES = 180 * 1024 * 1024;

const ROLE_RANK = { upper: 0, lower: 1, bite: 2, other: 3 } as const;

export type CadProjectPreview = {
  models: File[];
  images: File[];
};

/** 3Shape 주문 묶음. zip이면 스캔이 들어 있고, XML이면 없다. */
export function isCadPackageFileName(fileName: string): boolean {
  const ext = getModelExtLower(fileName);
  return ext === ".3ox" || ext === ".3oxz";
}

function isZipBuffer(buffer: ArrayBuffer): boolean {
  const u8 = new Uint8Array(buffer);
  return u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b;
}

/**
 * ZIP64 끝 레코드가 있는데 EOCD 디스크 번호가 0xFFFF가 아닌 zip을 JSZip이 비우지 않게 한다.
 * scanbodyLibraryBundle의 3Shape zip과 같은 보정.
 */
function markZip64Eocd(bytes: Uint8Array): Uint8Array {
  const sig = (at: number, b3: number, b4: number) =>
    bytes[at] === 0x50 &&
    bytes[at + 1] === 0x4b &&
    bytes[at + 2] === b3 &&
    bytes[at + 3] === b4;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i -= 1) {
    if (!sig(i, 5, 6)) continue;
    if (i >= 20 && sig(i - 20, 6, 7)) {
      bytes[i + 4] = 0xff;
      bytes[i + 5] = 0xff;
    }
    break;
  }
  return bytes;
}

function uniqueBaseName(raw: string, used: Set<string>): string {
  const base = String(raw || "").split("/").pop() || "scan.dcm";
  const clean = base.trim() || "scan.dcm";
  if (!used.has(clean.toLowerCase())) {
    used.add(clean.toLowerCase());
    return clean;
  }
  const dot = clean.lastIndexOf(".");
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : "";
  let index = 2;
  let next = `${stem}-${index}${ext}`;
  while (used.has(next.toLowerCase())) {
    index += 1;
    next = `${stem}-${index}${ext}`;
  }
  used.add(next.toLowerCase());
  return next;
}

function sortModels(models: File[]): File[] {
  return [...models].sort((a, b) => {
    const rankA = ROLE_RANK[classifyOralScanFileName(a.name)];
    const rankB = ROLE_RANK[classifyOralScanFileName(b.name)];
    if (rankA !== rankB) return rankA - rankB;
    return a.name.localeCompare(b.name, "ko");
  });
}

async function expandZip(buffer: ArrayBuffer, depth = 0): Promise<CadProjectPreview> {
  const { default: JSZip } = await import("jszip");
  let zip: {
    files: Record<
      string,
      {
        dir: boolean;
        name: string;
        async: (type: "uint8array" | "arraybuffer") => Promise<Uint8Array | ArrayBuffer>;
      }
    >;
  };
  try {
    zip = await JSZip.loadAsync(markZip64Eocd(new Uint8Array(buffer)));
  } catch {
    throw new Error("파일을 열지 못했습니다.");
  }

  const models: File[] = [];
  const images: File[] = [];
  const used = new Set<string>();
  const nested: ArrayBuffer[] = [];

  for (const key of Object.keys(zip.files)) {
    const entry = zip.files[key];
    const name = String(entry?.name || key).replace(/\\/g, "/");
    if (!entry || entry.dir || name.startsWith("__MACOSX/") || name.includes("/._")) {
      continue;
    }
    const base = name.split("/").pop() || "";
    const ext = getModelExtLower(base);
    if (MESH_EXT.has(ext)) {
      const data = (await entry.async("uint8array")) as Uint8Array;
      if (data.byteLength < 32 || data.byteLength > MAX_ENTRY_BYTES) continue;
      const fileName = uniqueBaseName(base, used);
      models.push(
        new File([data.slice()], fileName, {
          type: mimeTypeForModelFileName(fileName),
        }),
      );
      continue;
    }
    if (IMAGE_EXT.has(ext)) {
      const data = (await entry.async("uint8array")) as Uint8Array;
      if (data.byteLength < 16 || data.byteLength > 30 * 1024 * 1024) continue;
      const fileName = uniqueBaseName(base, used);
      images.push(fileFromImageBlob(new Blob([data.slice()]), fileName));
      continue;
    }
    if (depth < 1 && (ext === ".zip" || ext === ".3oxz" || ext === ".3ox")) {
      const data = (await entry.async("arraybuffer")) as ArrayBuffer;
      if (data.byteLength >= 32 && data.byteLength <= MAX_ENTRY_BYTES && isZipBuffer(data)) {
        nested.push(data);
      }
    }
  }

  if (models.length === 0) {
    for (const inner of nested.slice(0, 4)) {
      const expanded = await expandZip(inner, depth + 1);
      models.push(...expanded.models);
      images.push(...expanded.images);
    }
  }

  return { models: sortModels(models), images };
}

/** zip 묶음이면 안의 스캔·사진. XML 프로젝트면 빈 목록. */
export async function expandCadProjectPreview(file: File): Promise<CadProjectPreview> {
  const buffer = await file.arrayBuffer();
  if (!isZipBuffer(buffer)) return { models: [], images: [] };
  return expandZip(buffer);
}
