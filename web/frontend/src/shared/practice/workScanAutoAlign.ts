// 의뢰 상악·하악·바이트를 AI 디자인이 열 때와 같은 순서로 맞추고 작업 DCM으로 쓴다.
// 바이트에 악궁을 붙이고(registerJawsToBite), 교합면 중심을 원점으로 옮긴다(reseatOcclusalOrigin).
// 백엔드 작업 스캔 자동 정렬 잡이 Node 번들로 돌린다.
// related files:
// - web/frontend/src/node/workScanAutoAlign.node.ts
// - web/frontend/src/shared/components/practice/OralScanOverlayViewer.tsx
// - web/backend/services/workScanAutoAlign.service.js
import * as THREE from "three";

import { encodeHpsCaDcm, linearColorsToSrgbBytes } from "@/shared/files/hpsDcmWrite";
import { parseModelPreview } from "@/shared/files/modelPreviewFile";
import {
  abutsWorkScanFileName,
  type WorkScanRole,
} from "@/shared/practice/labProsthesisAiDesign";
import { registerJawsToBite } from "@/shared/practice/biteRegistration";
import {
  estimateDentalFrame,
  reseatOcclusalOrigin,
} from "@/shared/practice/dentalFrame";

export type WorkScanAlignInput = {
  role: WorkScanRole;
  fileName: string;
  bytes: ArrayBuffer;
};

export type WorkScanAlignOutput = {
  role: WorkScanRole;
  fileName: string;
  bytes: Uint8Array;
};

export type WorkScanAlignResult =
  | { status: "aligned"; files: WorkScanAlignOutput[]; moved: boolean }
  | { status: "incomplete" };

const ROLE_ORDER: WorkScanRole[] = ["upper", "lower", "bite"];

function exportMesh(geometry: THREE.BufferGeometry) {
  const pos = geometry.getAttribute("position");
  const positions = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    positions[i * 3] = pos.getX(i);
    positions[i * 3 + 1] = pos.getY(i);
    positions[i * 3 + 2] = pos.getZ(i);
  }
  const index = geometry.getIndex();
  const indices = new Uint32Array(index ? index.count : pos.count);
  if (index) {
    for (let i = 0; i < index.count; i += 1) indices[i] = index.getX(i);
  } else {
    for (let i = 0; i < pos.count; i += 1) indices[i] = i;
  }
  const color = geometry.getAttribute("color");
  return {
    positions,
    indices,
    colors:
      color && color.count === pos.count ? linearColorsToSrgbBytes(color) : null,
  };
}

/**
 * 세 역할이 다 있어야 맞춘다. 결과는 세 역할 모두 작업 DCM이라, AI 디자인은 이 좌표에서 바로 시작한다.
 * 스캐너가 이미 같은 좌표로 낸 스캔은 바이트 맞춤이 좌표를 바꾸지 않는다(moved=false). 교합 원점은 그래도 옮긴다.
 */
export async function alignWorkScansToBite(
  inputs: readonly WorkScanAlignInput[],
): Promise<WorkScanAlignResult> {
  const roles = new Set(inputs.map((row) => row.role));
  if (!ROLE_ORDER.every((role) => roles.has(role))) return { status: "incomplete" };

  const entries: Array<{ role: WorkScanRole; geometry: THREE.BufferGeometry }> = [];
  for (const input of inputs) {
    const parsed = await parseModelPreview(
      new File([input.bytes], input.fileName, { type: "application/octet-stream" }),
    );
    const geometry = parsed.geometry;
    geometry.computeBoundingBox();
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    entries.push({ role: input.role, geometry });
  }

  const moved = await registerJawsToBite(entries);
  const frame = estimateDentalFrame(entries);
  if (frame) reseatOcclusalOrigin(entries, frame);

  const files: WorkScanAlignOutput[] = [];
  for (const role of ROLE_ORDER) {
    const rows = entries.filter((entry) => entry.role === role);
    for (let index = 0; index < rows.length; index += 1) {
      const blob = encodeHpsCaDcm(exportMesh(rows[index]!.geometry));
      files.push({
        role,
        fileName: abutsWorkScanFileName(role, index),
        bytes: new Uint8Array(await blob.arrayBuffer()),
      });
    }
  }
  return { status: "aligned", files, moved };
}
