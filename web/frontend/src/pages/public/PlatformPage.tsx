// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/pages/public/OfferPage.tsx
// - web/frontend/src/features/landing/landingOffers.ts
import { Navigate } from "react-router-dom";
import { offerPath } from "@/features/landing/landingOffers";

/** 레거시 `/platform` → 오퍼 `/offer/platform` */
export const PlatformPage = () => (
  <Navigate to={offerPath("platform")} replace />
);
