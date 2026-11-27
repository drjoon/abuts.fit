// change-log:
// - 2026-11-27: 각인 글자 분류기. 은닉층 1개 MLP(ReLU) + softmax. 순수 JS(네이티브 모듈 없음), JSON으로 저장.
// related files:
// - bg/pc2/lot-server/src/engrave/features.js
// - bg/pc2/lot-server/src/engrave/model-store.js
// - bg/pc2/lot-server/scripts/train-engrave.mjs

/** 출력 클래스: A–Z + 배경(글자 아님). */
export const CLASSES = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "_"];
export const BG = CLASSES.length - 1;

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

export function createMlp(inDim, hidden, outDim, seed = 7) {
  const r = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
  const w1 = new Float32Array(inDim * hidden).map(() => gauss() * Math.sqrt(2 / inDim));
  const w2 = new Float32Array(hidden * outDim).map(() => gauss() * Math.sqrt(2 / hidden));
  return { inDim, hidden, outDim, w1, b1: new Float32Array(hidden), w2, b2: new Float32Array(outDim) };
}

/** 확률(softmax). h는 은닉 버퍼(재사용). */
export function forward(m, x, h = new Float32Array(m.hidden), out = new Float32Array(m.outDim)) {
  const { inDim, hidden, outDim, w1, b1, w2, b2 } = m;
  for (let j = 0; j < hidden; j += 1) {
    let s = b1[j];
    const o = j * inDim;
    for (let i = 0; i < inDim; i += 1) s += w1[o + i] * x[i];
    h[j] = s > 0 ? s : 0;
  }
  let max = -Infinity;
  for (let k = 0; k < outDim; k += 1) {
    let s = b2[k];
    const o = k * hidden;
    for (let j = 0; j < hidden; j += 1) s += w2[o + j] * h[j];
    out[k] = s;
    if (s > max) max = s;
  }
  let sum = 0;
  for (let k = 0; k < outDim; k += 1) {
    out[k] = Math.exp(out[k] - max);
    sum += out[k];
  }
  for (let k = 0; k < outDim; k += 1) out[k] /= sum;
  return out;
}

/**
 * SGD 학습(모멘텀, 가중치 감쇠). X: Float32Array[] , Y: 클래스 번호[], W: 표본 가중치(선택).
 */
export function train(m, X, Y, { epochs = 20, lr = 0.05, momentum = 0.9, decay = 1e-4, weights = null, seed = 11, log = () => {} } = {}) {
  const { inDim, hidden, outDim, w1, b1, w2, b2 } = m;
  const vw1 = new Float32Array(w1.length);
  const vb1 = new Float32Array(b1.length);
  const vw2 = new Float32Array(w2.length);
  const vb2 = new Float32Array(b2.length);
  const h = new Float32Array(hidden);
  const p = new Float32Array(outDim);
  const dh = new Float32Array(hidden);
  const order = Array.from(X.keys());
  const r = rng(seed);
  for (let ep = 0; ep < epochs; ep += 1) {
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(r() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const rate = lr * (1 - ep / epochs) + lr * 0.05;
    let loss = 0;
    let correct = 0;
    for (const idx of order) {
      const x = X[idx];
      const y = Y[idx];
      const wgt = weights ? weights[idx] : 1;
      forward(m, x, h, p);
      loss += -Math.log(p[y] + 1e-9);
      let best = 0;
      for (let k = 1; k < outDim; k += 1) if (p[k] > p[best]) best = k;
      if (best === y) correct += 1;
      dh.fill(0);
      for (let k = 0; k < outDim; k += 1) {
        const g = (p[k] - (k === y ? 1 : 0)) * wgt;
        const o = k * hidden;
        for (let jj = 0; jj < hidden; jj += 1) {
          dh[jj] += g * w2[o + jj];
          const gi = g * h[jj] + decay * w2[o + jj];
          vw2[o + jj] = momentum * vw2[o + jj] - rate * gi;
          w2[o + jj] += vw2[o + jj];
        }
        vb2[k] = momentum * vb2[k] - rate * g;
        b2[k] += vb2[k];
      }
      for (let jj = 0; jj < hidden; jj += 1) {
        if (h[jj] <= 0) continue;
        const g = dh[jj];
        const o = jj * inDim;
        for (let ii = 0; ii < inDim; ii += 1) {
          const gi = g * x[ii] + decay * w1[o + ii];
          vw1[o + ii] = momentum * vw1[o + ii] - rate * gi;
          w1[o + ii] += vw1[o + ii];
        }
        vb1[jj] = momentum * vb1[jj] - rate * g;
        b1[jj] += vb1[jj];
      }
    }
    log(`epoch ${ep + 1}/${epochs} loss=${(loss / order.length).toFixed(4)} acc=${((correct / order.length) * 100).toFixed(1)}%`);
  }
  return m;
}

export function toJson(m, meta = {}) {
  return {
    format: "engrave-mlp-1",
    classes: CLASSES.join(""),
    inDim: m.inDim,
    hidden: m.hidden,
    outDim: m.outDim,
    w1: Array.from(m.w1, (v) => Number(v.toFixed(5))),
    b1: Array.from(m.b1, (v) => Number(v.toFixed(5))),
    w2: Array.from(m.w2, (v) => Number(v.toFixed(5))),
    b2: Array.from(m.b2, (v) => Number(v.toFixed(5))),
    meta,
  };
}

export function fromJson(j) {
  if (!j || j.format !== "engrave-mlp-1") throw new Error("모델 형식이 다릅니다.");
  return {
    inDim: j.inDim,
    hidden: j.hidden,
    outDim: j.outDim,
    w1: Float32Array.from(j.w1),
    b1: Float32Array.from(j.b1),
    w2: Float32Array.from(j.w2),
    b2: Float32Array.from(j.b2),
    meta: j.meta || {},
  };
}
