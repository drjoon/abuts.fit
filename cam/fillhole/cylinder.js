#!/usr/bin/env node

// Simple STL screw hole cap generator for custom abutments
// - Assumes binary STL
// - Assumes screw hole axis is aligned with +Z or -Z
// - Caps the top by adding a circular disk mesh at the top Z of the model
//
// Usage examples (single file):
//   node fill_screw_hole.js input_0.stl output_1.stl
//   node fill_screw_hole.js input_0.stl output_1.stl --radius=1.4 --thickness=0.3 --segments=48 --direction=+z
//
// Batch mode (directory → directory):
//   node fill_screw_hole.js input output
//   node fill_screw_hole.js ./input ./output --radius=1.4 --thickness=0.3
//
// NOTE: This is geometry-agnostic and does NOT try to detect the existing hole.
//       It simply adds a thin circular cap at the model's top, centered on the
//       global XY bounding-box center. Tune radius / thickness to your CAM needs.

const fs = require("fs");
const path = require("path");

function parseArgs() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    // default: ./input -> ./output (batch mode)
    argv.push("./input", "./output");
  } else if (argv.length === 1) {
    console.error(
      "Usage: node fill_screw_hole.js <input.stl> <output.stl> | <inputDir> <outputDir> [--radius=1.4] [--thickness=0.3] [--segments=32] [--direction=+z|-z]"
    );
    process.exit(1);
  }

  const input = argv[0];
  const output = argv[1];

  let radius = 1.2; // mm, default screw hole radius (diameter 2.4mm)
  let thickness = 0.3; // mm
  let segments = 32;
  let direction = "+z"; // or "-z"

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--radius=")) {
      radius = parseFloat(arg.split("=")[1]);
    } else if (arg.startsWith("--thickness=")) {
      thickness = parseFloat(arg.split("=")[1]);
    } else if (arg.startsWith("--segments=")) {
      segments = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--direction=")) {
      const v = arg.split("=")[1];
      if (v === "+z" || v === "-z") direction = v;
    }
  }

  if (!fs.existsSync(input)) {
    console.error("Input path not found:", input);
    process.exit(1);
  }

  let mode = "file";
  try {
    const stat = fs.statSync(input);
    if (stat.isDirectory()) {
      mode = "dir";
    }
  } catch (e) {
    // already handled by existsSync above
  }

  return { mode, input, output, radius, thickness, segments, direction };
}

function readBinaryStl(buffer) {
  if (buffer.length < 84) {
    throw new Error("Buffer too small to be a valid binary STL");
  }
  const header = buffer.subarray(0, 80);
  const faceCount = buffer.readUInt32LE(80);
  const expectedLength = 84 + faceCount * 50;
  if (buffer.length < expectedLength) {
    console.warn(
      `Warning: buffer shorter than expected for ${faceCount} faces (expected ${expectedLength}, got ${buffer.length})`
    );
  }

  const triangles = [];
  let offset = 84;
  for (let i = 0; i < faceCount; i++) {
    if (offset + 50 > buffer.length) break;

    const nx = buffer.readFloatLE(offset + 0);
    const ny = buffer.readFloatLE(offset + 4);
    const nz = buffer.readFloatLE(offset + 8);

    const v1 = {
      x: buffer.readFloatLE(offset + 12),
      y: buffer.readFloatLE(offset + 16),
      z: buffer.readFloatLE(offset + 20),
    };
    const v2 = {
      x: buffer.readFloatLE(offset + 24),
      y: buffer.readFloatLE(offset + 28),
      z: buffer.readFloatLE(offset + 32),
    };
    const v3 = {
      x: buffer.readFloatLE(offset + 36),
      y: buffer.readFloatLE(offset + 40),
      z: buffer.readFloatLE(offset + 44),
    };

    const attr = buffer.readUInt16LE(offset + 48);

    triangles.push({ normal: { x: nx, y: ny, z: nz }, v1, v2, v3, attr });

    offset += 50;
  }

  return { header, triangles };
}

function writeBinaryStl(header, triangles, outPath) {
  const faceCount = triangles.length;
  const buffer = Buffer.alloc(84 + faceCount * 50);

  // header (80 bytes)
  if (header && header.length === 80) {
    header.copy(buffer, 0, 0, 80);
  } else {
    buffer.fill(0, 0, 80);
  }

  buffer.writeUInt32LE(faceCount, 80);

  let offset = 84;
  triangles.forEach((t) => {
    buffer.writeFloatLE(t.normal.x, offset + 0);
    buffer.writeFloatLE(t.normal.y, offset + 4);
    buffer.writeFloatLE(t.normal.z, offset + 8);

    buffer.writeFloatLE(t.v1.x, offset + 12);
    buffer.writeFloatLE(t.v1.y, offset + 16);
    buffer.writeFloatLE(t.v1.z, offset + 20);

    buffer.writeFloatLE(t.v2.x, offset + 24);
    buffer.writeFloatLE(t.v2.y, offset + 28);
    buffer.writeFloatLE(t.v2.z, offset + 32);

    buffer.writeFloatLE(t.v3.x, offset + 36);
    buffer.writeFloatLE(t.v3.y, offset + 40);
    buffer.writeFloatLE(t.v3.z, offset + 44);

    buffer.writeUInt16LE(t.attr ?? 0, offset + 48);

    offset += 50;
  });

  fs.writeFileSync(outPath, buffer);
}

function computeBBox(triangles) {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  for (const t of triangles) {
    const vs = [t.v1, t.v2, t.v3];
    for (const v of vs) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
      if (v.z > maxZ) maxZ = v.z;
    }
  }

  return { minX, minY, minZ, maxX, maxY, maxZ };
}

// Estimate internal screw hole center (cx, cy) and radius by sampling
// faces (triangles) in the z=2-3mm range.
// Assumptions:
// - Screw axis is Z (but not necessarily through world origin)
// - Internal hole radius is roughly constant in this Z range.
function estimateScrewCenterAndRadius(triangles) {
  const zMin = 2.0;
  const zMax = 3.0;
  const samples = [];

  for (const t of triangles) {
    const centroidZ = (t.v1.z + t.v2.z + t.v3.z) / 3;
    if (centroidZ < zMin || centroidZ > zMax) continue;

    const vs = [t.v1, t.v2, t.v3];
    for (const v of vs) {
      const r = Math.sqrt(v.x * v.x + v.y * v.y);
      samples.push({ x: v.x, y: v.y, r });
    }
  }

  if (!samples.length) {
    return { cx: 0, cy: 0, radius: 1.4 };
  }

  // 1) 먼저 반지름 분포에서 작은 쪽 일부(예: 20%)를 골라서 내부 홀 후보로 사용
  const radiiSorted = samples.map((s) => s.r).sort((a, b) => a - b);
  const cutoffIdx = Math.max(0, Math.floor(radiiSorted.length * 0.2));
  const cutoffR = radiiSorted[cutoffIdx];

  const holePoints = samples.filter((s) => s.r <= cutoffR * 1.05);
  if (!holePoints.length) {
    return { cx: 0, cy: 0, radius: cutoffR || 1.4 };
  }

  // 2) 이 점들의 XY 평균을 중심으로 사용
  let sumX = 0;
  let sumY = 0;
  for (const p of holePoints) {
    sumX += p.x;
    sumY += p.y;
  }
  const cx = sumX / holePoints.length;
  const cy = sumY / holePoints.length;

  // 3) 중심 기준 반지름 재계산
  let sumR = 0;
  for (const p of holePoints) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    sumR += Math.sqrt(dx * dx + dy * dy);
  }
  let radius = sumR / holePoints.length;

  // 임상적으로 말이 되는 범위로 클램프 (mm)
  if (radius < 0.3) radius = 0.3;
  if (radius > 3.0) radius = 3.0;

  console.log(
    `[fill_screw_hole]   detected center=(${cx.toFixed(3)}, ${cy.toFixed(
      3
    )}), radius=${radius.toFixed(3)}`
  );

  return { cx, cy, radius };
}

// Estimate the post axis using two z-slices of the tapered side wall.
// We take centroids of side-wall points near z=z1 and z=z2 (measured from the
// screw center), then the axis is the line through these two centroids.
function estimatePostAxis(triangles, screwRadius, center) {
  const minR = screwRadius * 1.4;
  const maxR = screwRadius * 4.0;

  const z1 = 1.0;
  const z2 = 3.0;
  const dz = 0.4; // slice half-thickness

  let c1x = 0,
    c1y = 0,
    c1z = 0,
    n1 = 0;
  let c2x = 0,
    c2y = 0,
    c2z = 0,
    n2 = 0;

  for (const t of triangles) {
    const vs = [t.v1, t.v2, t.v3];
    for (const v of vs) {
      const dx = v.x - center.cx;
      const dy = v.y - center.cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r < minR || r > maxR) continue;

      if (Math.abs(v.z - z1) <= dz) {
        c1x += v.x;
        c1y += v.y;
        c1z += v.z;
        n1++;
      } else if (Math.abs(v.z - z2) <= dz) {
        c2x += v.x;
        c2y += v.y;
        c2z += v.z;
        n2++;
      }
    }
  }

  if (n1 < 10 || n2 < 10) {
    // Fallback: use world Z through origin
    return {
      point: { x: 0, y: 0, z: 0 },
      dir: { x: 0, y: 0, z: 1 },
    };
  }

  c1x /= n1;
  c1y /= n1;
  c1z /= n1;
  c2x /= n2;
  c2y /= n2;
  c2z /= n2;

  const dirX = c2x - c1x;
  const dirY = c2y - c1y;
  const dirZ = c2z - c1z;
  const len = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ) || 1;

  return {
    point: { x: c1x, y: c1y, z: c1z },
    dir: { x: dirX / len, y: dirY / len, z: dirZ / len },
  };
}

// Estimate occlusal surface plane around the screw hole.
// We collect triangles near the top (high z) and near the screw hole radius,
// average their normals and positions, and use that as a reference plane.
function estimateOcclusalPlane(triangles, screwRadius, cx, cy) {
  const bbox = computeBBox(triangles);
  const zTop = bbox.maxZ;
  const zWindow = 0.6; // mm window below zTop to consider as occlusal region

  const minR = screwRadius * 0.8;
  const maxR = screwRadius * 2.5;

  let sumNx = 0,
    sumNy = 0,
    sumNz = 0,
    sumX = 0,
    sumY = 0,
    sumZ = 0,
    n = 0;

  for (const t of triangles) {
    const vs = [t.v1, t.v2, t.v3];
    let used = false;
    for (const v of vs) {
      if (v.z < zTop - zWindow) continue;
      const dx = v.x - cx;
      const dy = v.y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r < minR || r > maxR) continue;
      used = true;
    }
    if (!used) continue;

    // approximate area weight by triangle size in XY
    const a = vs[0];
    const b = vs[1];
    const c = vs[2];
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const vx = c.x - a.x;
    const vy = c.y - a.y;
    const vz = c.z - a.z;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const area2 = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!area2) continue;

    const cxTri = (a.x + b.x + c.x) / 3;
    const cyTri = (a.y + b.y + c.y) / 3;
    const czTri = (a.z + b.z + c.z) / 3;

    sumNx += nx;
    sumNy += ny;
    sumNz += nz;
    sumX += cxTri;
    sumY += cyTri;
    sumZ += czTri;
    n++;
  }

  if (!n) {
    // Fallback: use horizontal plane at zTop
    return {
      point: { x: cx, y: cy, z: zTop },
      normal: { x: 0, y: 0, z: 1 },
    };
  }

  const p = { x: sumX / n, y: sumY / n, z: sumZ / n };
  let nx = sumNx;
  let ny = sumNy;
  let nz = sumNz;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;

  // Ensure normal roughly points upward
  if (nz < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }

  return { point: p, normal: { x: nx, y: ny, z: nz } };
}

function addScrewCap(triangles, options) {
  const { radius, thickness, segments, direction } = options;
  const bbox = computeBBox(triangles);

  // Screw hole axis is assumed to be Z through the global origin (0,0)
  const cx = 0;
  const cy = 0;

  const sign = direction === "-z" ? -1 : 1;
  // Fill only from the connection plane (z=0) up to the top of the abutment.
  // This avoids intersecting the underlying post body.
  const zBase = 0;
  const zTop = bbox.maxZ;

  const ringBase = [];
  const ringTop = [];

  for (let i = 0; i < segments; i++) {
    const theta = (2 * Math.PI * i) / segments;
    const x = cx + radius * Math.cos(theta);
    const y = cy + radius * Math.sin(theta);
    ringBase.push({ x, y, z: zBase });
    ringTop.push({ x, y, z: zTop });
  }

  const centerTop = { x: cx, y: cy, z: zTop };
  const centerBase = { x: cx, y: cy, z: zBase };

  const newTriangles = [];

  // helper to compute normal from three vertices
  function makeNormal(a, b, c) {
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const vx = c.x - a.x;
    const vy = c.y - a.y;
    const vz = c.z - a.z;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    return { x: nx / len, y: ny / len, z: nz / len };
  }

  // Top disk (fills the hole). Orientation depends on sign.
  for (let i = 0; i < segments; i++) {
    const v1 = ringTop[i];
    const v2 = ringTop[(i + 1) % segments];
    let a, b, c;
    if (sign > 0) {
      // normal roughly +Z
      a = centerTop;
      b = v1;
      c = v2;
    } else {
      // normal roughly -Z
      a = centerTop;
      b = v2;
      c = v1;
    }
    const normal = makeNormal(a, b, c);
    newTriangles.push({ normal, v1: a, v2: b, v3: c, attr: 0 });
  }

  // Cylinder side wall (optional but makes plug volumetric)
  for (let i = 0; i < segments; i++) {
    const b1 = ringBase[i];
    const b2 = ringBase[(i + 1) % segments];
    const t1 = ringTop[i];
    const t2 = ringTop[(i + 1) % segments];

    // two triangles: (b1, b2, t1), (b2, t2, t1)
    let a1 = b1,
      b1p = b2,
      c1 = t1;
    let a2 = b2,
      b2p = t2,
      c2 = t1;

    // orient so that outside normal direction roughly equals sign
    const n1 = makeNormal(a1, b1p, c1);
    const n2 = makeNormal(a2, b2p, c2);

    const orientedN1 = n1.z * sign >= 0 ? n1 : makeNormal(a1, c1, b1p);
    const orientedN2 = n2.z * sign >= 0 ? n2 : makeNormal(a2, c2, b2p);

    newTriangles.push({ normal: orientedN1, v1: a1, v2: b1p, v3: c1, attr: 0 });
    newTriangles.push({ normal: orientedN2, v1: a2, v2: b2p, v3: c2, attr: 0 });
  }

  // Optionally, you can also close the bottom of the plug, but since
  // it lies exactly on zBase, it usually coincides with existing surface
  // triangles and is not necessary for CAM.

  return triangles.concat(newTriangles);
}

function processSingleFile(input, output, options) {
  const buf = fs.readFileSync(input);
  const { header, triangles } = readBinaryStl(buf);

  let { radius, thickness, segments, direction } = options;

  // Use fixed screw hole center at (0,0). Radius is either CLI value or
  // default from parseArgs (1.2mm).
  const centerInfo = { cx: 0, cy: 0 };

  console.log(
    `[fill_screw_hole] file=${path.basename(input)} faces=${
      triangles.length
    }, radius=${radius}, thickness=${thickness}, segments=${segments}, direction=${direction}`
  );

  const newTriangles = addScrewCap(triangles, {
    radius,
    thickness,
    segments,
    direction,
  });

  console.log(
    `[fill_screw_hole]   → output faces=${newTriangles.length} (added ${
      newTriangles.length - triangles.length
    })`
  );

  const outDir = path.dirname(output);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  writeBinaryStl(header, newTriangles, output);
}

function main() {
  const { mode, input, output, radius, thickness, segments, direction } =
    parseArgs();

  if (mode === "file") {
    processSingleFile(input, output, {
      radius,
      thickness,
      segments,
      direction,
    });
    console.log("[fill_screw_hole] Done (single file):", output);
    return;
  }

  const inputDir = input;
  const outputDir = output;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const entries = fs.readdirSync(inputDir);
  const stlFiles = entries.filter((name) =>
    name.toLowerCase().endsWith(".stl")
  );

  if (!stlFiles.length) {
    console.warn("[fill_screw_hole] No .stl files found in", inputDir);
    return;
  }

  console.log(
    `[fill_screw_hole] Batch mode: ${inputDir} → ${outputDir}, files=${stlFiles.length}`
  );

  for (const name of stlFiles) {
    const inPath = path.join(inputDir, name);
    const outPath = path.join(outputDir, name);

    processSingleFile(inPath, outPath, {
      radius,
      thickness,
      segments,
      direction,
    });
  }

  console.log("[fill_screw_hole] Done (batch)");
}

if (require.main === module) {
  main();
}
