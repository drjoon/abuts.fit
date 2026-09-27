// 겹친 닫힌 메시를 합집합으로 한 덩어리 메시로 만든다. manifold-3d(WASM)는 처음 쓸 때 불러온다.

import type { Manifold, ManifoldToplevel } from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";

export type MeshUnionFailure = "open" | "separate" | "failed";

export class MeshUnionError extends Error {
  constructor(
    readonly reason: MeshUnionFailure,
    readonly label: string,
  ) {
    super(`${label}: ${reason}`);
    this.name = "MeshUnionError";
  }
}

let loading: Promise<ManifoldToplevel> | null = null;

function loadManifold(): Promise<ManifoldToplevel> {
  if (!loading) {
    loading = import("manifold-3d").then(async ({ default: Module }) => {
      const wasm = await Module({ locateFile: () => wasmUrl });
      wasm.setup();
      return wasm;
    });
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

/** 삼각형 목록(꼭짓점 3개씩)을 같은 좌표끼리 이어 색인 메시로 만든다. */
function weld(soup: Float32Array) {
  const ids = new Map<string, number>();
  const verts: number[] = [];
  const tris = new Uint32Array(soup.length / 3);
  for (let i = 0; i < tris.length; i += 1) {
    const x = soup[i * 3]!;
    const y = soup[i * 3 + 1]!;
    const z = soup[i * 3 + 2]!;
    const key = `${x},${y},${z}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = verts.length / 3;
      ids.set(key, id);
      verts.push(x, y, z);
    }
    tris[i] = id;
  }
  return { numProp: 3, vertProperties: Float32Array.from(verts), triVerts: tris };
}

/**
 * 조각마다 닫힌 입체여야 한다. 닫히지 않았거나, 합친 결과가 여러 덩어리로 떨어지면
 * MeshUnionError를 던진다. 겹친 메시를 그대로 돌려주지 않는다.
 */
export async function unionTriangleSoups(
  pieces: readonly Float32Array[],
  label: string,
): Promise<Float32Array> {
  const wasm = await loadManifold();
  const owned: Manifold[] = [];
  try {
    for (const soup of pieces) {
      if (soup.length < 9) continue;
      const mesh = new wasm.Mesh(weld(soup));
      mesh.merge();
      try {
        owned.push(new wasm.Manifold(mesh));
      } catch {
        throw new MeshUnionError("open", label);
      }
    }
    if (owned.length === 0) throw new MeshUnionError("failed", label);
    const joined = wasm.Manifold.union(owned);
    owned.push(joined);
    if (joined.status() !== "NoError" || joined.isEmpty()) {
      throw new MeshUnionError("failed", label);
    }
    const parts = joined.decompose();
    owned.push(...parts);
    if (parts.length > 1) throw new MeshUnionError("separate", label);
    const { vertProperties, triVerts, numProp } = joined.getMesh();
    const out = new Float32Array(triVerts.length * 3);
    for (let i = 0; i < triVerts.length; i += 1) {
      const v = triVerts[i]! * numProp;
      out[i * 3] = vertProperties[v]!;
      out[i * 3 + 1] = vertProperties[v + 1]!;
      out[i * 3 + 2] = vertProperties[v + 2]!;
    }
    return out;
  } finally {
    for (const solid of owned) solid.delete();
  }
}

export function meshUnionErrorMessage(error: MeshUnionError): string {
  if (error.reason === "open") return `${error.label}: 닫히지 않은 메시가 있어 합칠 수 없습니다.`;
  if (error.reason === "separate") return `${error.label}: 커넥터가 치아에 닿지 않아 한 덩어리가 되지 않습니다.`;
  return `${error.label}: 메시를 합치지 못했습니다.`;
}
