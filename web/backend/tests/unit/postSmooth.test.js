import { writeBinaryStl } from "../../utils/screwHoleFill.js";
import { POST_SMOOTH_PATCH_ATTRIBUTE, smoothPostAboveFinishLine } from "../../services/abutmentStl/postSmooth.js";

const SEGMENTS = 96;
const MARGIN = { r: 2.5, z: 2 };
const STAIR_MM = 0.012;
const STAIR_PERIOD_MM = 0.2;

/** 커프(원뿔) → 마진 모서리 → 계단 결 있는 포스트 → 윗면. [r, z] 아래에서 위로. */
function profile() {
  const rows = [[0, 0]];
  for (let i = 0; i <= 20; i += 1) rows.push([2 + (0.5 * i) / 20, (2 * i) / 20]);
  for (let i = 1; i <= 80; i += 1) {
    const z = MARGIN.z + i * 0.05;
    rows.push([postR(z), z]);
  }
  rows.push([1, 6]);
  rows.push([0, 6]);
  return rows;
}

/** 마진에서 안쪽으로 부드럽게 들어가 곧게 서는 포스트 + 톱니 계단. */
function postR(z) {
  const phase = ((z - MARGIN.z) / STAIR_PERIOD_MM) % 1;
  return 2.1 + 0.4 * Math.exp(-(z - MARGIN.z) / 0.3) - STAIR_MM * phase;
}

function buildStl() {
  const rows = profile();
  const at = (i, j) => {
    const [r, z] = rows[i];
    const t = (2 * Math.PI * (j % SEGMENTS)) / SEGMENTS;
    return [r * Math.cos(t), r * Math.sin(t), z];
  };
  const positions = [];
  for (let i = 0; i + 1 < rows.length; i += 1) {
    for (let j = 0; j < SEGMENTS; j += 1) {
      const a = at(i, j);
      const b = at(i, j + 1);
      const c = at(i + 1, j + 1);
      const d = at(i + 1, j);
      if (rows[i][0] > 0) positions.push(...a, ...b, ...c);
      if (rows[i + 1][0] > 0) positions.push(...a, ...c, ...d);
    }
  }
  return writeBinaryStl({
    positions: Float32Array.from(positions),
    attributes: new Uint16Array(positions.length / 9),
  });
}

function readTriangles(buffer) {
  const n = buffer.readUInt32LE(80);
  const verts = [];
  const attrs = [];
  for (let t = 0; t < n; t += 1) {
    const o = 84 + t * 50;
    for (let k = 0; k < 3; k += 1) {
      verts.push([0, 1, 2].map((q) => buffer.readFloatLE(o + 12 + k * 12 + q * 4)));
    }
    attrs.push(buffer.readUInt16LE(o + 48));
  }
  return { verts, attrs };
}

const keyOf = (p) => p.map((x) => x.toFixed(6)).join(",");

const finishLine = {
  points: Array.from({ length: SEGMENTS }, (_, j) => {
    const t = (2 * Math.PI * j) / SEGMENTS;
    return [MARGIN.r * Math.cos(t), MARGIN.r * Math.sin(t), MARGIN.z];
  }),
};

/** 포스트 가운데 띠에서 계단 없는 기준 곡선과의 반경 차 표준편차(계단 결 크기). */
function stairRoughness(verts) {
  const base = (z) => 2.1 + 0.4 * Math.exp(-(z - MARGIN.z) / 0.3);
  const d = verts.filter((p) => p[2] > 3 && p[2] < 5).map((p) => Math.hypot(p[0], p[1]) - base(p[2]));
  const mean = d.reduce((s, x) => s + x, 0) / d.length;
  return Math.sqrt(d.reduce((s, x) => s + (x - mean) ** 2, 0) / d.length);
}

describe("smoothPostAboveFinishLine", () => {
  const input = buildStl();
  const result = smoothPostAboveFinishLine(input, { finishLine });

  it("applies on a stepped post", () => {
    expect(result.status).toBe("applied");
    expect(result.detail.fixedFinishVertices).toBe(SEGMENTS);
    expect(result.detail.maxInwardUm).toBeLessThanOrEqual(50);
  });

  it("keeps the finish line and everything below it bit-exact", () => {
    const before = new Set(readTriangles(input).verts.filter((p) => p[2] <= MARGIN.z + 1e-6).map(keyOf));
    const after = new Set(readTriangles(result.buffer).verts.map(keyOf));
    for (const k of before) expect(after.has(k)).toBe(true);
  });

  it("moves post vertices inward only", () => {
    const { verts, attrs } = readTriangles(result.buffer);
    const rows = profile();
    /** 원본 메시 옆모습(행 사이 직선) 반경 */
    const meshR = (z) => {
      const i = rows.findIndex((row, k) => k > 0 && row[1] >= z && rows[k - 1][1] < z);
      const [r0, z0] = rows[i - 1];
      const [r1, z1] = rows[i];
      return r0 + ((r1 - r0) * (z - z0)) / (z1 - z0);
    };
    const sagitta = 2.5 * (1 - Math.cos(Math.PI / SEGMENTS));
    let worstOut = -Infinity;
    for (const p of verts) {
      if (p[2] <= MARGIN.z || p[2] > 5.95) continue;
      worstOut = Math.max(worstOut, Math.hypot(p[0], p[1]) - meshR(p[2]));
    }
    expect(worstOut).toBeLessThan(sagitta + 1e-5);
    expect(attrs.some((a) => a === POST_SMOOTH_PATCH_ATTRIBUTE)).toBe(true);
  });

  it("reduces the stair ripple", () => {
    const before = stairRoughness(readTriangles(input).verts);
    const after = stairRoughness(readTriangles(result.buffer).verts);
    expect(after).toBeLessThan(before * 0.5);
  });

  it("does not smooth an already smoothed post again", () => {
    const again = smoothPostAboveFinishLine(result.buffer, { finishLine });
    expect(again.status).toBe("skipped");
  });

  it("skips without a finish line", () => {
    expect(smoothPostAboveFinishLine(input, { finishLine: null }).status).toBe("skipped");
  });
});
