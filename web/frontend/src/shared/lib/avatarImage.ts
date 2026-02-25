const GRADIENTS: Array<[string, string]> = [
  ["#dbeafe", "#2563eb"],
  ["#fce7f3", "#db2777"],
  ["#d1fae5", "#059669"],
  ["#ede9fe", "#7c3aed"],
  ["#fef3c7", "#d97706"],
  ["#fee2e2", "#ef4444"],
  ["#e0f2fe", "#0ea5e9"],
  ["#fdf2f8", "#be185d"],
];

const clampInitial = (value: string | undefined | null) => {
  if (!value) return "?";
  const trimmed = value.trim();
  if (!trimmed) return "?";
  const firstCodePoint = Array.from(trimmed)[0];
  return firstCodePoint.toUpperCase();
};

const hashSeed = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0; // eslint-disable-line no-bitwise
  }
  return Math.abs(hash);
};

export const generateAvatarDataUrl = (seed: string, initial?: string) => {
  const safeInitial = clampInitial(initial);
  const palette = GRADIENTS[hashSeed(seed) % GRADIENTS.length];
  const gradientId = `g${hashSeed(seed + safeInitial).toString(16)}`;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80">
      <defs>
        <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${palette[0]}" />
          <stop offset="100%" stop-color="${palette[1]}" />
        </linearGradient>
      </defs>
      <rect width="80" height="80" rx="40" fill="url(#${gradientId})" />
      <text x="50%" y="55%" text-anchor="middle" font-size="36" font-family="'Pretendard','Inter',sans-serif" fill="#ffffff" font-weight="600">${safeInitial}</text>
    </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};
