// change-log:
// - 2026-11-27: 홀드아웃용 글자 편향(focusLetters)·혼동쌍(V/Y, T/I, W/Y …) 합성. 실측이 없는 글자 칸을 더 만든다.
// - 2026-11-27: bgSource(실측 금속면 조각)를 주면 그 위에 각인을 그린다(합성 결과가 실측 질감과 같아지도록).
// - 2026-11-27: 각인(양각·테두리만 진한) 3글자 합성. 헤어라인 금속 결, 밝은 테두리(halo)·어두운 윤곽·면 채움, 조명·흐림·잡음.
//   글자 칸(32×48)과 어긋난 칸(배경 클래스)을 함께 낸다. 실측 표본이 없는 글자를 메운다.
// related files:
// - bg/pc2/lot-server/scripts/train-engrave.mjs
// - bg/pc2/lot-server/src/engrave/crops.js

import sharp from "sharp";
import { CELL_H, CELL_W } from "./features.js";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** 데이터셋에 드물거나 서로 헷갈리는 글자 — 합성 때 더 자주 넣는다. */
export const FOCUS_LETTERS = [..."ACDKTUVWX"];
/** 혼동쌍: 한 자리에 둘 중 하나를 넣어 구분 학습. */
export const CONFUSION_PAIRS = [
  ["V", "Y"],
  ["W", "Y"],
  ["T", "I"],
  ["T", "J"],
  ["U", "V"],
  ["D", "B"],
  ["D", "O"],
  ["X", "K"],
  ["C", "G"],
  ["A", "R"],
  ["Z", "B"],
];
// 있는 글꼴만 쓰인다(없으면 기본 글꼴). Windows/리눅스 공통 후보.
const FONTS = [
  "Arial Rounded MT Bold",
  "Varela Round",
  "Nunito",
  "Arial",
  "Arimo",
  "Liberation Sans",
  "DejaVu Sans",
  "Verdana",
  "Tahoma",
  "Segoe UI",
  "Consolas",
  "Courier New",
];

/** 합성 3글자 문자열. focusLetters가 있으면 그 글자를 한 자리 이상 넣고, 혼동쌍도 섞는다. */
export function pickSynthCode(r, focusLetters = FOCUS_LETTERS) {
  const focus = (focusLetters || []).filter((c) => LETTERS.includes(c));
  const pool = focus.length ? focus : [...FOCUS_LETTERS];
  if (r.next() < 0.4 && CONFUSION_PAIRS.length) {
    const [a, b] = r.pick(CONFUSION_PAIRS);
    const pick = r.next() < 0.5 ? a : b;
    const slot = r.int(0, 2);
    return Array.from({ length: 3 }, (_, i) => (i === slot ? pick : r.pick([...LETTERS]))).join("");
  }
  if (r.next() < 0.55 && pool.length) {
    const must = r.pick(pool);
    const slot = r.int(0, 2);
    return Array.from({ length: 3 }, (_, i) => {
      if (i === slot) return must;
      return r.next() < 0.35 && pool.length ? r.pick(pool) : r.pick([...LETTERS]);
    }).join("");
  }
  return Array.from({ length: 3 }, () => r.pick([...LETTERS])).join("");
}

export function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => Math.floor(a + (b - a + 1) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

function hash(n) {
  let x = Math.imul(n | 0, 0x27d4eb2d) ^ 0x165667b1;
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b);
  x ^= x >>> 13;
  return ((x >>> 0) % 10000) / 10000;
}

/** 헤어라인 금속 결 + 조명 기울기. */
export function brushedBackground(width, height, r, base) {
  const out = new Float32Array(width * height);
  const theta = r.range(0, Math.PI);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const density = r.range(0.6, 2.2);
  const amp = r.range(6, 34);
  const gx = r.range(-0.25, 0.25);
  const gy = r.range(-0.25, 0.25);
  const seed = r.int(1, 1e6);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const t = (x * c + y * s) * density;
      const line = hash(Math.floor(t) + seed) - 0.5;
      const along = hash(Math.floor((x * -s + y * c) / 9) * 7919 + Math.floor(t) + seed) - 0.5;
      const light = 1 + gx * (x / width - 0.5) + gy * (y / height - 0.5);
      out[y * width + x] = base * light + amp * line + amp * 0.35 * along + (Math.random() - 0.5) * 8;
    }
  }
  return out;
}

/**
 * 양각 각인에 가까운 기하 획(열린 path). 글꼴보다 V/Y·T/I·W 구분이 안정적이다.
 * 좌표계: 칸 중심 (cx,cy), 폭 lw·높이 lh.
 */
export function geometricLetterPath(ch, cx, cy, lw, lh) {
  const x0 = cx - lw / 2;
  const x1 = cx + lw / 2;
  const y0 = cy - lh / 2;
  const y1 = cy + lh / 2;
  const xm = cx;
  const ym = cy;
  switch (ch) {
    case "V":
      return `M ${x0} ${y0} L ${xm} ${y1} L ${x1} ${y0}`;
    case "W":
      return `M ${x0} ${y0} L ${x0 + lw * 0.25} ${y1} L ${xm} ${y0 + lh * 0.35} L ${x1 - lw * 0.25} ${y1} L ${x1} ${y0}`;
    case "Y":
      return `M ${x0} ${y0} L ${xm} ${ym} L ${x1} ${y0} M ${xm} ${ym} L ${xm} ${y1}`;
    case "T":
      return `M ${x0} ${y0} L ${x1} ${y0} M ${xm} ${y0} L ${xm} ${y1}`;
    case "I":
      return `M ${x0 + lw * 0.15} ${y0} L ${x1 - lw * 0.15} ${y0} M ${xm} ${y0} L ${xm} ${y1} M ${x0 + lw * 0.15} ${y1} L ${x1 - lw * 0.15} ${y1}`;
    case "U":
      return `M ${x0} ${y0} L ${x0} ${y1 - lh * 0.2} Q ${x0} ${y1} ${xm} ${y1} Q ${x1} ${y1} ${x1} ${y1 - lh * 0.2} L ${x1} ${y0}`;
    case "A":
      return `M ${x0} ${y1} L ${xm} ${y0} L ${x1} ${y1} M ${x0 + lw * 0.22} ${ym + lh * 0.12} L ${x1 - lw * 0.22} ${ym + lh * 0.12}`;
    case "X":
      return `M ${x0} ${y0} L ${x1} ${y1} M ${x1} ${y0} L ${x0} ${y1}`;
    case "K":
      return `M ${x0} ${y0} L ${x0} ${y1} M ${x0} ${ym} L ${x1} ${y0} M ${x0} ${ym} L ${x1} ${y1}`;
    case "D":
      return `M ${x0} ${y0} L ${x0} ${y1} L ${xm + lw * 0.05} ${y1} Q ${x1} ${y1} ${x1} ${ym} Q ${x1} ${y0} ${xm + lw * 0.05} ${y0} Z`;
    case "C":
      return `M ${x1 - lw * 0.1} ${y0 + lh * 0.18} Q ${x0} ${y0} ${x0} ${ym} Q ${x0} ${y1} ${x1 - lw * 0.1} ${y1 - lh * 0.18}`;
    default:
      return null;
  }
}

export function svgFor(code, { width, height, pitch, capH, font, style, x0, usePaths = false }) {
  const fontSize = capH / 0.72;
  const baseline = height / 2 + capH / 2;
  const cy = height / 2;
  const g = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a.toFixed(2)})`;
  const parts = [];
  for (let i = 0; i < code.length; i += 1) {
    const cx = x0 + (i + 0.5) * pitch;
    const path = usePaths ? geometricLetterPath(code[i], cx, cy, pitch * 0.72, capH) : null;
    if (path) {
      const common = `fill="none" stroke-linecap="round" stroke-linejoin="round" d="${path}"`;
      if (style.halo > 0) {
        parts.push(`<path ${common} stroke="${g(style.haloV, style.haloA)}" stroke-width="${style.halo.toFixed(1)}"/>`);
      }
      parts.push(`<path ${common} stroke="${g(style.outlineV, style.outlineA)}" stroke-width="${style.outline.toFixed(1)}"/>`);
      if (style.fillA > 0.05) {
        parts.push(`<path ${common} stroke="${g(style.fillV, style.fillA)}" stroke-width="${Math.max(1, style.outline * 0.45 + style.fatten).toFixed(1)}"/>`);
      }
      continue;
    }
    const attrs = `x="${cx.toFixed(1)}" y="${baseline.toFixed(1)}" text-anchor="middle"`;
    if (style.halo > 0) {
      parts.push(`<text ${attrs} fill="none" stroke="${g(style.haloV, style.haloA)}" stroke-width="${style.halo.toFixed(1)}" stroke-linejoin="round">${code[i]}</text>`);
    }
    parts.push(`<text ${attrs} fill="none" stroke="${g(style.outlineV, style.outlineA)}" stroke-width="${style.outline.toFixed(1)}" stroke-linejoin="round">${code[i]}</text>`);
    parts.push(`<text ${attrs} fill="${g(style.fillV, style.fillA)}" stroke="${g(style.fillV, style.fillA)}" stroke-width="${(style.fatten * 2).toFixed(1)}" stroke-linejoin="round">${code[i]}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<g font-family="${font}" font-weight="${style.weight}" font-size="${fontSize.toFixed(1)}" transform="rotate(${style.tilt.toFixed(2)} ${width / 2} ${height / 2})">${parts.join("")}</g></svg>`;
}

/**
 * 합성 3글자 한 장. 글자 칸 3개와 배경 칸 몇 개(어긋난 칸)를 돌려준다.
 * @returns {Promise<{ cells: { gray: Uint8Array, label: string }[] }>}
 */
export async function synthCode(r, code = null, { bgCells = 3, bgSource = null, realProb = 0.75, focusLetters = FOCUS_LETTERS } = {}) {
  const text = code || pickSynthCode(r, focusLetters);
  const capH = r.range(52, 72);
  // T·I·J는 세로획이 좁고, W·M은 넓다 — 피치 범위를 글자에 조금 맞춘다.
  const wide = [...text].some((c) => "WM".includes(c));
  const narrow = [...text].some((c) => "TIJ".includes(c));
  const aspect = wide ? r.range(0.72, 0.98) : narrow ? r.range(0.55, 0.78) : r.range(0.62, 0.9);
  const pitch = capH * aspect;
  const width = Math.round(pitch * 5.2);
  const height = Math.round(capH * 2.6);
  const x0 = (width - pitch * 3) / 2;
  const realBg = bgSource && r.next() < realProb ? await bgSource(width, height, r) : null;
  let realMean = 0;
  if (realBg) {
    for (const v of realBg) realMean += v;
    realMean /= realBg.length;
  }
  const washed = realBg ? realMean > 165 : r.next() < 0.3;
  const base = realBg ? realMean : washed ? r.range(170, 225) : r.range(70, 170);
  const style = washed
    ? {
        halo: r.next() < 0.5 ? r.range(4, 9) : 0,
        haloV: Math.min(255, base + r.range(10, 30)),
        haloA: 0.7,
        outline: r.range(3, 7),
        outlineV: base - r.range(50, 110),
        outlineA: r.range(0.6, 0.95),
        fillV: base - r.range(5, 45),
        fillA: r.range(0.3, 0.8),
        weight: r.pick(["bold", "bold", "bold", "normal"]),
        tilt: r.range(-4, 4),
      }
    : {
        halo: r.range(5, 13),
        haloV: Math.min(255, base + r.range(30, 90)),
        haloA: r.range(0.45, 0.9),
        outline: r.range(3, 8),
        outlineV: Math.max(0, base - r.range(50, 110)),
        outlineA: r.range(0.6, 0.95),
        fillV: base + r.range(-50, 15),
        fillA: r.range(0.25, 0.75),
        weight: r.pick(["bold", "bold", "bold", "normal"]),
        tilt: r.range(-4, 4),
      };
  const font = r.pick(FONTS);
  // 실측 각인 획은 굵다(글자 높이의 ~0.2). 같은 색 획으로 살을 붙이고 윤곽·halo는 그 바깥에.
  style.fatten = capH * r.range(0.015, 0.075);
  style.outline += style.fatten * 2;
  if (style.halo > 0) style.halo = style.outline + r.range(4, 10);
  const bg = realBg || brushedBackground(width, height, r, base);
  // 기하 획은 보조(글꼴이 주). 너무 높이면 실측 마진이 떨어진다.
  const needsPath = [...text].some((c) => "VTWIAXUCDK".includes(c));
  const usePaths = needsPath ? r.next() < 0.35 : r.next() < 0.1;
  const svg = svgFor(text, { width, height, pitch, capH, font, style, x0, usePaths });
  const overlay = await sharp(Buffer.from(svg))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = overlay.info.channels;
  const img = new Uint8Array(width * height);
  // 면 위에도 결이 보이게: 덮을 때 결의 일부를 남긴다.
  // 실측 각인은 면이 바탕과 같은 금속이라 결이 그대로 보인다.
  const texKeep = realBg ? r.range(0.5, 1) : r.range(0.15, 0.5);
  for (let i = 0; i < width * height; i += 1) {
    const a = overlay.data[i * ch + 3] / 255;
    const v = overlay.data[i * ch];
    const b = bg[i];
    const mixed = b * (1 - a) + (v + (b - base) * texKeep) * a;
    img[i] = Math.max(0, Math.min(255, mixed));
  }
  const blur = r.range(0.4, 2.2);
  const { data } = await sharp(Buffer.from(img), { raw: { width, height, channels: 1 } })
    .blur(blur)
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const gamma = r.range(0.75, 1.3);
  const contrast = r.range(0.7, 1.25);
  const mean = data.reduce((s, v) => s + v, 0) / data.length;
  const adj = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 1) {
    let v = (data[i] - mean) * contrast + mean;
    v = 255 * Math.pow(Math.max(0, Math.min(255, v)) / 255, gamma) + (r.next() - 0.5) * r.range(0, 14);
    adj[i] = Math.max(0, Math.min(255, v));
  }
  if (process.env.ENGRAVE_SYNTH_DEBUG) await sharp(Buffer.from(adj), { raw: { width, height, channels: 1 } }).png().toFile(process.env.ENGRAVE_SYNTH_DEBUG);
  const cy = height / 2;
  // 실측 라벨과 같은 정의: 칸 높이 = 보이는 글자 높이(윤곽 포함) × 1.15.
  const cellH = (capH + style.outline) * 1.15;
  const cells = [];
  const jitter = () => r.range(-0.07, 0.07);
  for (let i = 0; i < 3; i += 1) {
    const cx = x0 + (i + 0.5) * pitch + jitter() * pitch;
    const sy = 1 + r.range(-0.08, 0.08);
    cells.push({ label: text[i], box: { cx, cy: cy + jitter() * cellH, w: pitch * (1 + r.range(-0.06, 0.06)), h: cellH * sy } });
  }
  for (let k = 0; k < bgCells; k += 1) {
    const kind = r.int(0, 3);
    let cx;
    let cyy = cy;
    if (kind === 0) cx = x0 + r.int(0, 3) * pitch + r.range(-0.15, 0.15) * pitch; // 글자 사이
    else if (kind === 1) cx = x0 + r.range(0.5, 2.5) * pitch, cyy = cy + r.pick([-1, 1]) * r.range(0.45, 0.8) * cellH; // 위·아래로 어긋남
    else if (kind === 2) cx = x0 + r.pick([-0.6, 3.6]) * pitch; // 줄 밖
    else cx = x0 + r.range(0.5, 2.5) * pitch, cyy = cy; // 크기가 틀린 칸
    const scale = kind === 3 ? r.pick([0.55, 1.8]) : 1;
    cells.push({ label: "_", box: { cx, cy: cyy, w: pitch * scale, h: cellH * scale } });
  }
  const out = [];
  for (const c of cells) {
    const gray = await cropCell(adj, width, height, c.box);
    if (gray) out.push({ gray, label: c.label });
  }
  return { cells: out, text };
}

/** 원본 회색조에서 칸(중심·크기)을 잘라 32×48로. 밖으로 나가면 가장자리 복제. */
export async function cropCell(gray, width, height, { cx, cy, w, h }) {
  const left = Math.round(cx - w / 2);
  const top = Math.round(cy - h / 2);
  const cw = Math.max(4, Math.round(w));
  const chh = Math.max(4, Math.round(h));
  const buf = new Uint8Array(cw * chh);
  for (let y = 0; y < chh; y += 1) {
    const sy = Math.max(0, Math.min(height - 1, top + y));
    for (let x = 0; x < cw; x += 1) {
      const sx = Math.max(0, Math.min(width - 1, left + x));
      buf[y * cw + x] = gray[sy * width + sx];
    }
  }
  const { data } = await sharp(Buffer.from(buf), { raw: { width: cw, height: chh, channels: 1 } })
    .resize(CELL_W, CELL_H, { fit: "fill" })
    .blur(0.8)
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new Uint8Array(data);
}
