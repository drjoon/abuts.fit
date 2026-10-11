// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/features/landing/LandingOfferPage.tsx
// - web/frontend/src/features/landing/landingOffers.ts
// - web/frontend/src/features/landing/platformOfferContent.ts
// - web/frontend/src/features/landing/PlatformOfferSections.tsx
import { Navigate, useParams } from "react-router-dom";
import { LandingOfferPage } from "@/features/landing/LandingOfferPage";
import {
  getLandingOffer,
  LEGACY_OFFER_REDIRECTS,
  offerPath,
} from "@/features/landing/landingOffers";
import {
  offerSectionId,
  useLandingOfferInline,
} from "@/features/landing/landingOfferInline";
import { PublicPageLayout } from "./components/PublicPageLayout";

/** `/offer/:slug` — 헤더(플랫폼 · 어벗츠기공소 · 이벤트)의 상세 설명 */
const OfferPage = () => {
  const { slug } = useParams();
  const offerInline = useLandingOfferInline();
  const legacyTarget = slug ? LEGACY_OFFER_REDIRECTS[slug] : undefined;
  if (legacyTarget) {
    if (offerInline) {
      return (
        <Navigate
          to={{ pathname: "/", hash: `#${offerSectionId(legacyTarget)}` }}
          replace
        />
      );
    }
    return <Navigate to={offerPath(legacyTarget)} replace />;
  }
  const offer = getLandingOffer(slug);
  if (!offer) return <Navigate to="/" replace />;
  if (offerInline) {
    return (
      <Navigate
        to={{ pathname: "/", hash: `#${offerSectionId(offer.slug)}` }}
        replace
      />
    );
  }

  return (
    <PublicPageLayout
      tone="light"
      plain
      footerSurface={offer.lab || offer.platform ? "sky" : "white"}
      contentClassName="relative z-10 w-full max-w-none px-0 py-0"
    >
      <LandingOfferPage offer={offer} />
    </PublicPageLayout>
  );
};

export default OfferPage;
