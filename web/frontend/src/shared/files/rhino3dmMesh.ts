// Rhino 3DM → 인덱스 메시. 심플어벗 업로드가 STL로 바꾸기 전에 쓴다.
// 패키지 main은 Node용 CJS라 브라우저 청크는 rhino3dm.module.js(vite alias)와 wasm URL을 쓴다.
import rhino3dm from "rhino3dm";
import wasmUrl from "rhino3dm/rhino3dm.wasm?url";
import type { ScanbodyMesh } from "@/shared/practice/scanbodyRegistration";

type Rhino = Awaited<ReturnType<typeof rhino3dm>>;

type ThreeBuffers = {
  position?: Float32Array;
  index?: Uint32Array;
};

type RhinoMesh = {
  faces: () => { convertQuadsToTriangles: () => boolean };
  toThreejsBuffers: (rotateToYUp: boolean) => ThreeBuffers;
};

type RhinoGeometry = {
  objectType: number;
  getMesh?: (meshType: number) => RhinoMesh | null;
};

let loading: Promise<Rhino> | null = null;

function rhinoModule() {
  if (!loading) {
    loading = rhino3dm({ locateFile: () => wasmUrl }).catch((error: unknown) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}

function meshOf(rhino: Rhino, geometry: RhinoGeometry | null): RhinoMesh | null {
  if (!geometry) return null;
  if (geometry.objectType === rhino.ObjectType.Mesh) return geometry as unknown as RhinoMesh;
  if (typeof geometry.getMesh !== "function") return null;
  return geometry.getMesh(rhino.MeshType.Any) ?? geometry.getMesh(rhino.MeshType.Render) ?? null;
}

function buffersOf(mesh: RhinoMesh): ThreeBuffers {
  const first = mesh.toThreejsBuffers(false);
  if (first.index && first.index.length % 3 !== 0) {
    mesh.faces().convertQuadsToTriangles();
    return mesh.toThreejsBuffers(false);
  }
  return first;
}

/** 3DM 안의 메시를 모은다. NURBS만 있고 캐시된 메시가 없으면 실패한다. */
export async function meshFrom3dmFile(file: File): Promise<ScanbodyMesh> {
  const rhino = await rhinoModule();
  const doc = rhino.File3dm.fromByteArray(new Uint8Array(await file.arrayBuffer()));
  if (!doc) throw new Error("3DM 파일을 열지 못했습니다.");
  try {
    const meshes: RhinoMesh[] = [];
    const objects = doc.objects();
    for (let i = 0; i < objects.count; i += 1) {
      const mesh = meshOf(rhino, objects.get(i).geometry() as RhinoGeometry);
      if (mesh) meshes.push(mesh);
    }
    if (meshes.length === 0) throw new Error("3DM에 메시가 없습니다. STL로 내보내 주세요.");

    const positions: number[] = [];
    const indices: number[] = [];
    for (const mesh of meshes) {
      const buffers = buffersOf(mesh);
      const position = buffers.position;
      if (!position || position.length < 9 || position.length % 3 !== 0) continue;
      const base = positions.length / 3;
      for (let i = 0; i < position.length; i += 1) positions.push(position[i]!);
      const index = buffers.index;
      if (index && index.length >= 3) {
        for (let i = 0; i < index.length; i += 1) indices.push(base + index[i]!);
      } else {
        for (let i = 0; i < position.length / 3; i += 1) indices.push(base + i);
      }
    }
    if (indices.length < 3 || indices.length % 3 !== 0) {
      throw new Error("3DM에 면이 없습니다. STL로 내보내 주세요.");
    }
    return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
  } finally {
    doc.destroy();
  }
}
