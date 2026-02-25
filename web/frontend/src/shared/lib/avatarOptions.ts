const sanitizeSeedBase = (seed: string) =>
  seed.replace(/[^a-z0-9-_]/gi, "").toLowerCase() || "user";

export const DEFAULT_AVATAR_TOTAL = 64;
export const AVATAR_BATCH_SIZE = 16;

export const generateRemoteAvatarUrls = (
  seedBase: string,
  nonce: number,
  total: number = DEFAULT_AVATAR_TOTAL,
) => {
  const safeBase = sanitizeSeedBase(seedBase || "user");
  return Array.from({ length: total }, (_, index) => {
    const seed = `${safeBase}-${nonce}-${index + 1}`;
    return `https://robohash.org/${encodeURIComponent(seed)}?set=set4&bgset=bg1`;
  });
};
