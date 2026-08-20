// related files:
// - web/frontend/src/shared/hooks/useS3TempUpload.ts
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/rules.md

const MESH_EXT = new Set([".stl", ".ply", ".obj"]);
const IMAGE_EXT_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};
const MIN_BYTES_TO_COMPRESS = 256 * 1024;
const MIN_RATIO = 0.92;

const getExtLower = (name: string) => {
  const lower = String(name || "").trim().toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return "";
  return lower.slice(dot);
};

const resolveUploadMimetype = (file: File) => {
  const raw = String(file.type || "").trim().toLowerCase();
  if (raw === "image/jpg") return "image/jpeg";
  if (raw && raw !== "application/octet-stream") return raw;
  return IMAGE_EXT_MIME[getExtLower(file.name)] || raw || "application/octet-stream";
};

const gzipWithCompressionStream = async (file: File): Promise<Blob | null> => {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = file.stream().pipeThrough(new CompressionStream("gzip"));
    return await new Response(stream).blob();
  } catch {
    return null;
  }
};

export type PreparedUploadBlob = {
  blob: Blob;
  contentEncoding?: "gzip";
  uncompressedSize: number;
  mimetype: string;
  originalName: string;
};

/** STL/PLY/OBJ는 gzip이 유의미할 때만 압축. 원본 파일명은 유지. */
export async function prepareUploadBlob(file: File): Promise<PreparedUploadBlob> {
  const originalName = file.name;
  const mimetype = resolveUploadMimetype(file);
  const uncompressedSize = file.size;
  const ext = getExtLower(originalName);

  if (!MESH_EXT.has(ext) || uncompressedSize < MIN_BYTES_TO_COMPRESS) {
    return { blob: file, uncompressedSize, mimetype, originalName };
  }

  const compressed = await gzipWithCompressionStream(file);
  if (
    !compressed ||
    compressed.size <= 0 ||
    compressed.size >= uncompressedSize * MIN_RATIO
  ) {
    return { blob: file, uncompressedSize, mimetype, originalName };
  }

  return {
    blob: compressed,
    contentEncoding: "gzip",
    uncompressedSize,
    mimetype,
    originalName,
  };
}
