// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/public/ContactPage.tsx
export const COMPANY_PHONE = "1588-3948";

export const COMPANY_ADDRESS = "경상남도 거제시 거제중앙로29길 6, 3층(고현동)";

/** 지도 검색·임베드용 (층수 제외, 지번/도로명만) */
export const COMPANY_MAP_QUERY = "경상남도 거제시 거제중앙로29길 6";

export const COMPANY_MAP_EMBED_URL = `https://maps.google.com/maps?q=${encodeURIComponent(
  COMPANY_MAP_QUERY,
)}&hl=ko&z=17&output=embed`;

export const COMPANY_MAP_EXTERNAL_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  COMPANY_MAP_QUERY,
)}`;

export const COMPANY_NAME = "어벗츠 주식회사";
export const COMPANY_CEO_NAME = "배태완";
export const COMPANY_BUSINESS_REGISTRATION_NUMBER = "358-87-03514";

export const CONTACT_EMAIL = "contact@abuts.fit";
export const SUPPORT_EMAIL = "support@abuts.fit";
export const BUSINESS_EMAIL = "business@abuts.fit";
export const PRIVACY_EMAIL = "privacy@abuts.fit";
export const SECURITY_EMAIL = "security@abuts.fit";
export const POSTMASTER_EMAIL = "postmaster@abuts.fit";
