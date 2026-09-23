// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/pages/public/OfferPage.tsx
// - web/frontend/src/features/landing/landingOffers.ts
import { Navigate } from "react-router-dom";
import { offerPath } from "@/features/landing/landingOffers";

/** 레거시 `/platform` → 심플웨이 오퍼(플랫폼 내용은 심플웨이·기공사업부에 합침) */
export const PlatformPage = () => (
  <Navigate to={offerPath("simple-way")} replace />
);
