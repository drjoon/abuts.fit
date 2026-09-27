// 바이너리 STL. 삼각형마다 법선 12바이트 + 꼭짓점 36바이트 + 속성 2바이트.

/** positions는 삼각형 순서로 꼭짓점 3개씩(비색인). */
export function encodeBinaryStl(positions: Float32Array, header = "abuts.fit"): Blob {
  const triangles = Math.floor(positions.length / 9);
  const buffer = new ArrayBuffer(84 + triangles * 50);
  const view = new DataView(buffer);
  const label = new TextEncoder().encode(header).slice(0, 80);
  new Uint8Array(buffer, 0, 80).set(label);
  view.setUint32(80, triangles, true);
  let offset = 84;
  for (let t = 0; t < triangles; t += 1) {
    const i = t * 9;
    const ax = positions[i]!, ay = positions[i + 1]!, az = positions[i + 2]!;
    const bx = positions[i + 3]!, by = positions[i + 4]!, bz = positions[i + 5]!;
    const cx = positions[i + 6]!, cy = positions[i + 7]!, cz = positions[i + 8]!;
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (const value of [nx, ny, nz, ax, ay, az, bx, by, bz, cx, cy, cz]) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "model/stl" });
}
