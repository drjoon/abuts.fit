// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/public/ContactPage.tsx
export const COMPANY_PHONE = "1588-3948";
export const COMPANY_NAME = "어벗츠 주식회사";
export const COMPANY_CEO_NAME = "배태완";
export const COMPANY_BUSINESS_REGISTRATION_NUMBER = "358-87-03514";

export const COMPANY_ADDRESS = "경상남도 거제시 거제중앙로29길 6, 3층(고현동)";

/** 지도 검색·임베드용 (층수 제외, 지번/도로명만) */
export const COMPANY_MAP_QUERY = "경상남도 거제시 거제중앙로29길 6";

/** Nominatim 기준 건물 좌표 (거제중앙로29길 6) */
export const COMPANY_MAP_LAT = 34.890185;
export const COMPANY_MAP_LNG = 128.621686;

const MAP_BBOX_PAD = 0.008;
const mapBbox = [
  (COMPANY_MAP_LNG - MAP_BBOX_PAD).toFixed(6),
  (COMPANY_MAP_LAT - MAP_BBOX_PAD).toFixed(6),
  (COMPANY_MAP_LNG + MAP_BBOX_PAD).toFixed(6),
  (COMPANY_MAP_LAT + MAP_BBOX_PAD).toFixed(6),
].join(",");

/** Google `output=embed` 는 404·XFO로 iframe이 깨짐 → OSM (SalesRouteMap 폴백과 동일) */
export const COMPANY_MAP_EMBED_URL = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
  mapBbox,
)}&layer=mapnik&marker=${COMPANY_MAP_LAT}%2C${COMPANY_MAP_LNG}`;

export const COMPANY_MAP_EXTERNAL_URL = `https://map.kakao.com/link/map/${encodeURIComponent(
  COMPANY_NAME,
)},${COMPANY_MAP_LAT},${COMPANY_MAP_LNG}`;

export const CONTACT_EMAIL = "contact@abuts.fit";
export const SUPPORT_EMAIL = "support@abuts.fit";
export const BUSINESS_EMAIL = "business@abuts.fit";
export const PRIVACY_EMAIL = "privacy@abuts.fit";
export const SECURITY_EMAIL = "security@abuts.fit";
export const POSTMASTER_EMAIL = "postmaster@abuts.fit";
