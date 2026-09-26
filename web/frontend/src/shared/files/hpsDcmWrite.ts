// 정렬된 구강 스캔을 원본과 다른 작업 DCM(HPS CA)으로 쓴다.
// related files:
// - web/frontend/src/shared/files/hpsDcmPreview.ts
// - web/frontend/src/shared/components/practice/LabProsthesisAiDesignDialog.tsx

export type HpsCaMesh = {
  positions: Float32Array;
  indices: Uint32Array;
  /** sRGB 0..255. 없으면 무색. */
  colors?: Uint8Array | null;
};

function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + chunk));
    parts.push(String.fromCharCode.apply(null, slice as unknown as number[]));
  }
  return btoa(parts.join(""));
}

function copyBytes(view: ArrayBufferView): Uint8Array {
  const out = new Uint8Array(view.byteLength);
  out.set(
    new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
  );
  return out;
}

/** Restart triangle opcode 6 (uint32). 파서가 16비트 모드에서도 그대로 읽는다. */
function encodeFaces(indices: Uint32Array): { bytes: Uint8Array; faceCount: number } {
  const faceCount = Math.floor(indices.length / 3);
  const bytes = new Uint8Array(faceCount * 13);
  const view = new DataView(bytes.buffer);
  for (let face = 0; face < faceCount; face += 1) {
    const at = face * 13;
    bytes[at] = 6;
    view.setUint32(at + 1, indices[face * 3]!, true);
    view.setUint32(at + 5, indices[face * 3 + 1]!, true);
    view.setUint32(at + 9, indices[face * 3 + 2]!, true);
  }
  return { bytes, faceCount };
}

/** 현재 스캔 칼라(linear)를 HPS가 기대하는 sRGB 바이트로. */
export function linearColorsToSrgbBytes(
  color: { count: number; getX: (i: number) => number; getY: (i: number) => number; getZ: (i: number) => number },
): Uint8Array {
  const out = new Uint8Array(color.count * 3);
  const tmp = { r: 0, g: 0, b: 0 };
  for (let i = 0; i < color.count; i += 1) {
    const encoded = linearToSrgb(
      color.getX(i),
      color.getY(i),
      color.getZ(i),
      tmp,
    );
    const o = i * 3;
    out[o] = encoded.r;
    out[o + 1] = encoded.g;
    out[o + 2] = encoded.b;
  }
  return out;
}

function linearToSrgb(
  r: number,
  g: number,
  b: number,
  into: { r: number; g: number; b: number },
) {
  into.r = channelByte(r);
  into.g = channelByte(g);
  into.b = channelByte(b);
  return into;
}

function channelByte(linear: number): number {
  const x = Math.min(1, Math.max(0, linear));
  const s = x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, s)) * 255);
}

/**
 * 3Shape HPS CA XML DCM.
 * 버텍스 칼라는 VertexColorSet에 BGR로 넣는다. 파서가 R/B를 되돌린다.
 * abuts.work=1 이면 다시 열 때 색 보정을 반복하지 않는다.
 */
export function encodeHpsCaDcm(mesh: HpsCaMesh): Blob {
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const positions = mesh.positions.subarray(0, vertexCount * 3);
  const { bytes: faceBytes, faceCount } = encodeFaces(mesh.indices);
  const vertexBytes = copyBytes(positions);
  const colors = mesh.colors;
  const colorBlock =
    colors && colors.length >= vertexCount * 3
      ? `<VertexColorSets><VertexColorSet>${bytesToBase64(swapRgbToBgr(colors.subarray(0, vertexCount * 3)))}</VertexColorSet></VertexColorSets>`
      : "";
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<HPS version="1.1">` +
    `<Schema>CA</Schema>` +
    `<Properties><Property name="abuts.work" value="1"/></Properties>` +
    `<Vertices vertex_count="${vertexCount}">${bytesToBase64(vertexBytes)}</Vertices>` +
    `<Facets facet_count="${faceCount}">${bytesToBase64(faceBytes)}</Facets>` +
    colorBlock +
    `</HPS>`;
  return new Blob([xml], { type: "application/octet-stream" });
}

function swapRgbToBgr(rgb: Uint8Array): Uint8Array {
  const out = new Uint8Array(rgb.length);
  for (let i = 0; i < rgb.length; i += 3) {
    out[i] = rgb[i + 2]!;
    out[i + 1] = rgb[i + 1]!;
    out[i + 2] = rgb[i]!;
  }
  return out;
}
