#!/usr/bin/env node

// STL screw-hole occlusal cap generator (plane-fitting version)
// - Reads binary STL
// - Estimates screw hole center & radius around z=2~3mm
// - Estimates occlusal surface plane near top around the screw hole
// - Generates a circular plug whose top is on the fitted plane, and
//   extrudes it slightly along the plane normal into the hole
//
// Usage (single file):
//   node fit.js input.stl output.stl
//   node fit.js input.stl output.stl --radius=1.4 --segments=48 --extrusion=0.3
//
// Batch mode (directory -> directory):
//   node fit.js ./input ./output --radius=1.4 --segments=48 --extrusion=0.3

const fs = require("fs");
const path = require("path");

function parseArgs() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    // default: ./input -> ./output (batch mode)
    argv.push("./input", "./output");
  } else if (argv.length === 1) {
    console.error(
      "Usage: node fit.js <input.stl> <output.stl> | <inputDir> <outputDir> [--radius=1.4] [--segments=32] [--extrusion=0.3]"
    );
    process.exit(1);
  }

  const input = argv[0];
  const output = argv[1];

  let radius = 1.2; // mm, 기본 추정 반지름 (스캔에서 재조정 가능)
  let segments = 32;
  let extrusion = 0.3; // mm, 플러그가 홀 안으로 들어가는 두께

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--radius=")) {
      radius = parseFloat(arg.split("=")[1]);
    } else if (arg.startsWith("--segments=")) {
      segments = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--extrusion=")) {
      extrusion = parseFloat(arg.split("=")[1]);
    }
  }

  if (!fs.existsSync(input)) {
    console.error("Input path not found:", input);
    process.exit(1);
  }

  let mode = "file";
  try {
    const stat = fs.statSync(input);
    if (stat.isDirectory()) mode = "dir";
  } catch (e) {
    // already handled by existsSync
  }

  return { mode, input, output, radius, segments, extrusion };
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

// Screw hole center & radius estimation (same idea as cylinder.js)
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

  const radiiSorted = samples.map((s) => s.r).sort((a, b) => a - b);
  const cutoffIdx = Math.max(0, Math.floor(radiiSorted.length * 0.2));
  const cutoffR = radiiSorted[cutoffIdx];

  const holePoints = samples.filter((s) => s.r <= cutoffR * 1.05);
  if (!holePoints.length) {
    return { cx: 0, cy: 0, radius: cutoffR || 1.4 };
  }

  let sumX = 0;
  let sumY = 0;
  for (const p of holePoints) {
    sumX += p.x;
    sumY += p.y;
  }
  const cx = sumX / holePoints.length;
  const cy = sumY / holePoints.length;

  let sumR = 0;
  for (const p of holePoints) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    sumR += Math.sqrt(dx * dx + dy * dy);
  }
  let radius = sumR / holePoints.length;

  if (radius < 0.3) radius = 0.3;
  if (radius > 3.0) radius = 3.0;

  console.log(
    `[fit] detected screw center=(${cx.toFixed(3)}, ${cy.toFixed(
      3
    )}), radius=${radius.toFixed(3)}`
  );

  return { cx, cy, radius };
}

// Occlusal plane estimation around screw hole (adapted from cylinder.js)
function estimateOcclusalPlane(triangles, screwRadius, cx, cy) {
  const bbox = computeBBox(triangles);
  const zTop = bbox.maxZ;
  const zWindow = 0.6; // mm below zTop

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

  if (nz < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }

  return { point: p, normal: { x: nx, y: ny, z: nz } };
}

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

function addFittedCap(triangles, options) {
  let { radius, segments, extrusion } = options;

  const centerInfo = estimateScrewCenterAndRadius(triangles);
  const { cx, cy } = centerInfo;
  if (!radius) radius = centerInfo.radius;

  const plane = estimateOcclusalPlane(triangles, radius, cx, cy);
  const { point: p0, normal: n } = plane;

  console.log(
    `[fit] occlusal plane point=(${p0.x.toFixed(3)}, ${p0.y.toFixed(
      3
    )}, ${p0.z.toFixed(3)}), normal=(${n.x.toFixed(3)}, ${n.y.toFixed(
      3
    )}, ${n.z.toFixed(3)})`
  );

  // Build orthonormal basis (u, v) in the plane
  let ax = Math.abs(n.x) < 0.9 ? 1 : 0;
  let ay = ax === 1 ? 0 : 1;
  let az = 0;

  // u = a x n
  let ux = ay * n.z - az * n.y;
  let uy = az * n.x - ax * n.z;
  let uz = ax * n.y - ay * n.x;
  let lenU = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
  ux /= lenU;
  uy /= lenU;
  uz /= lenU;

  // v = n x u
  let vx = n.y * uz - n.z * uy;
  let vy = n.z * ux - n.x * uz;
  let vz = n.x * uy - n.y * ux;

  const ringTop = [];
  const ringBase = [];

  for (let i = 0; i < segments; i++) {
    const theta = (2 * Math.PI * i) / segments;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const px = p0.x + radius * (cosT * ux + sinT * vx);
    const py = p0.y + radius * (cosT * uy + sinT * vy);
    const pz = p0.z + radius * (cosT * uz + sinT * vz);

    const top = { x: px, y: py, z: pz };
    const base = {
      x: px - n.x * extrusion,
      y: py - n.y * extrusion,
      z: pz - n.z * extrusion,
    };

    ringTop.push(top);
    ringBase.push(base);
  }

  const centerTop = { ...p0 };
  const centerBase = {
    x: p0.x - n.x * extrusion,
    y: p0.y - n.y * extrusion,
    z: p0.z - n.z * extrusion,
  };

  const newTriangles = [];

  // Top disk on the fitted plane
  for (let i = 0; i < segments; i++) {
    const v1 = ringTop[i];
    const v2 = ringTop[(i + 1) % segments];

    const a = centerTop;
    const b = v1;
    const c = v2;
    const normal = makeNormal(a, b, c);
    newTriangles.push({ normal, v1: a, v2: b, v3: c, attr: 0 });
  }

  // Side wall (extruded into the hole)
  for (let i = 0; i < segments; i++) {
    const b1 = ringBase[i];
    const b2 = ringBase[(i + 1) % segments];
    const t1 = ringTop[i];
    const t2 = ringTop[(i + 1) % segments];

    const a1 = b1;
    const b1p = b2;
    const c1 = t1;
    const a2 = b2;
    const b2p = t2;
    const c2 = t1;

    const n1 = makeNormal(a1, b1p, c1);
    const n2 = makeNormal(a2, b2p, c2);

    newTriangles.push({ normal: n1, v1: a1, v2: b1p, v3: c1, attr: 0 });
    newTriangles.push({ normal: n2, v1: a2, v2: b2p, v3: c2, attr: 0 });
  }

  // Optional: bottom disk (inside hole). 보통 CAM에는 필요 없어서 생략할 수 있음.
  // 여기서는 안전하게 한 번 더 막아 둠.
  for (let i = 0; i < segments; i++) {
    const v1 = ringBase[i];
    const v2 = ringBase[(i + 1) % segments];
    const a = centerBase;
    const b = v2;
    const c = v1;
    const normal = makeNormal(a, b, c);
    newTriangles.push({ normal, v1: a, v2: b, v3: c, attr: 0 });
  }

  return triangles.concat(newTriangles);
}

function processSingleFile(input, output, options) {
  const buf = fs.readFileSync(input);
  const { header, triangles } = readBinaryStl(buf);

  let { radius, segments, extrusion } = options;

  console.log(
    `[fit] file=${path.basename(input)} faces=${
      triangles.length
    }, radius=${radius}, segments=${segments}, extrusion=${extrusion}`
  );

  const newTriangles = addFittedCap(triangles, {
    radius,
    segments,
    extrusion,
  });

  console.log(
    `[fit]   -> output faces=${newTriangles.length} (added ${
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
  const { mode, input, output, radius, segments, extrusion } = parseArgs();

  if (mode === "file") {
    processSingleFile(input, output, { radius, segments, extrusion });
    console.log("[fit] Done (single file):", output);
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
    console.warn("[fit] No .stl files found in", inputDir);
    return;
  }

  console.log(
    `[fit] Batch mode: ${inputDir} -> ${outputDir}, files=${stlFiles.length}`
  );

  for (const name of stlFiles) {
    const inPath = path.join(inputDir, name);
    const outPath = path.join(outputDir, name);

    processSingleFile(inPath, outPath, { radius, segments, extrusion });
  }

  console.log("[fit] Done (batch)");
}

if (require.main === module) {
  main();
}
