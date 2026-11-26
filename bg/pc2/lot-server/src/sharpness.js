// change-log:
// - 2026-11-26: tileFocusScore: 타일별 라플라시안 상위 10%. 매끈한 배경이 많은 현미경 화면에서 전역 평균보다 초점 차이가 크다(실측 흐림 1.7 / AF 후 13.7).
// - 2026-11-23: 움직임 비교용 meanAbsDiff 추가.
// - 2026-11-21: 연속 프레임에서 선명한 한 장을 고른다.
// related files:
// - bg/pc2/lot-server2/src/capture.js
// - bg/pc2/lot-server2/src/watch.js

export function scoreGray(gray, width, height) {
  if (!width || !height || gray.length < width * height) return 0;
  let sum = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 1; x < width; x += 1) {
      sum += Math.abs(gray[row + x] - gray[row + x - 1]);
      count += 1;
    }
  }
  for (let y = 1; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      sum += Math.abs(gray[y * width + x] - gray[(y - 1) * width + x]);
      count += 1;
    }
  }
  return count ? sum / count : 0;
}

export function selectBest(items) {
  if (!items.length) return null;
  const pool = items.length > 1 ? items.filter((item) => item.index > 0) : items;
  const list = pool.length ? pool : items;
  let best = list[0];
  for (const item of list) {
    if (item.score > best.score) best = item;
  }
  return best;
}

export function meanAbsDiff(a, b) {
  if (!a || !b || a.length !== b.length || !a.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/**
 * 화면을 타일로 나눠 라플라시안 평균을 구하고 상위 pct 타일 값을 돌려준다.
 * 글자·가장자리처럼 일부만 선명해도 크게 나온다.
 */
export function tileFocusScore(gray, width, height, { tilesX = 8, tilesY = 4, pct = 0.1 } = {}) {
  if (!width || !height || gray.length < width * height || width < 8 || height < 8) return 0;
  const tw = Math.floor(width / tilesX);
  const th = Math.floor(height / tilesY);
  if (tw < 3 || th < 3) return 0;
  const scores = [];
  for (let ty = 0; ty < tilesY; ty += 1) {
    for (let tx = 0; tx < tilesX; tx += 1) {
      let sum = 0;
      let n = 0;
      const yEnd = Math.min(height - 1, (ty + 1) * th);
      const xEnd = Math.min(width - 1, (tx + 1) * tw);
      for (let y = Math.max(1, ty * th); y < yEnd; y += 1) {
        for (let x = Math.max(1, tx * tw); x < xEnd; x += 1) {
          const p = y * width + x;
          sum += Math.abs(4 * gray[p] - gray[p - 1] - gray[p + 1] - gray[p - width] - gray[p + width]);
          n += 1;
        }
      }
      if (n) scores.push(sum / n);
    }
  }
  if (!scores.length) return 0;
  scores.sort((a, b) => b - a);
  return scores[Math.min(scores.length - 1, Math.floor(scores.length * pct))];
}
