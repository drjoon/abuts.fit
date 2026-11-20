// change-log:
// - 2026-11-21: 연속 프레임에서 선명한 한 장을 고른다.
// related files:
// - bg/pc2/lot-server2/src/capture.js

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
