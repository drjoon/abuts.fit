// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/features/landing/LandingOfferPage.tsx
// - web/frontend/src/features/landing/landingOffers.ts
import { Navigate, useParams } from "react-router-dom";
import { LandingOfferPage } from "@/features/landing/LandingOfferPage";
import {
  getLandingOffer,
  LEGACY_OFFER_REDIRECTS,
  offerPath,
} from "@/features/landing/landingOffers";
import { PublicPageLayout } from "./components/PublicPageLayout";

/** `/offer/:slug` — 헤더(심플웨이 · 기공사업부 · 이벤트)의 상세 설명 */
const OfferPage = () => {
  const { slug } = useParams();
  const legacyTarget = slug ? LEGACY_OFFER_REDIRECTS[slug] : undefined;
  if (legacyTarget) {
    return <Navigate to={offerPath(legacyTarget)} replace />;
  }
  const offer = getLandingOffer(slug);
  if (!offer) return <Navigate to="/" replace />;

  return (
    <PublicPageLayout
      tone="light"
      plain
      contentClassName="relative z-10 w-full max-w-none px-0 py-0"
    >
      <LandingOfferPage offer={offer} />
    </PublicPageLayout>
  );
};

export default OfferPage;
