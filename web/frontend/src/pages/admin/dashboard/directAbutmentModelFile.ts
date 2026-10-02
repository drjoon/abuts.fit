// 직접어벗·심플어벗 모델. 3DM은 브라우저에서 메시를 읽어 STL로 바꾼 뒤 기존 템플릿 업로드에 넘긴다.
import { encodeBinaryStl } from "@/shared/files/stlBinaryWrite";

export const DIRECT_ABUTMENT_MODEL_ACCEPT = ".3dm,.stl,.dcm,.ply,.obj";

export function isDirectAbutmentModelName(name: string) {
  return /\.(3dm|stl|dcm|ply|obj)$/i.test(name);
}

function meshToStlFile(positions: Float32Array, indices: Uint32Array, fileName: string) {
  const soup = new Float32Array(indices.length * 3);
  for (let i = 0; i < indices.length; i += 1) {
    const at = indices[i]! * 3;
    soup[i * 3] = positions[at]!;
    soup[i * 3 + 1] = positions[at + 1]!;
    soup[i * 3 + 2] = positions[at + 2]!;
  }
  const blob = encodeBinaryStl(soup, "abuts simple abutment");
  return new File([blob], fileName, { type: "model/stl" });
}

/** 서버가 읽는 형상으로 맞춘다. 3DM이 아니면 원본 그대로. */
export async function prepareDirectAbutmentUploadFile(file: File): Promise<File> {
  if (!isDirectAbutmentModelName(file.name)) {
    throw new Error("3DM, STL, DCM, PLY, OBJ 파일만 올릴 수 있습니다.");
  }
  if (!/\.3dm$/i.test(file.name)) return file;
  const { meshFrom3dmFile } = await import("@/shared/files/rhino3dmMesh");
  const mesh = await meshFrom3dmFile(file);
  const name = file.name.replace(/\.3dm$/i, "") + ".stl";
  return meshToStlFile(mesh.positions, mesh.indices, name);
}
