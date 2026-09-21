/**
 * 가입 시 프로필 이미지 자동 할당. 프론트 `/avatars/01.webp`…`64.webp`와 동일 팩.
 * 시드는 이메일이면 가입·재할당이 같은 이미지를 고른다.
 */
export function defaultProfileImageForSeed(seed) {
  const s = String(seed || "user");
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) {
    hash = (Math.imul(hash, 31) + s.charCodeAt(i)) >>> 0;
  }
  const n = (hash % 64) + 1;
  return `/avatars/${String(n).padStart(2, "0")}.webp`;
}
