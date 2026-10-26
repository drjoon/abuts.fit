// change-log:
// - 2026-10-27: `/offer/*` 는 랜딩 앵커로 보낸다. 본문은 `/` 에 있다.
// related files:
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/features/landing/landingOffers.ts
import { Navigate, useParams } from "react-router-dom";
import {
  getLandingOffer,
  LEGACY_OFFER_REDIRECTS,
} from "@/features/landing/landingOffers";
import { offerSectionId } from "@/features/landing/landingOfferInline";

/** `/offer/:slug` → `/#offer-{slug}` */
const OfferPage = () => {
  const { slug } = useParams();
  const legacyTarget = slug ? LEGACY_OFFER_REDIRECTS[slug] : undefined;
  const offer = getLandingOffer(legacyTarget ?? slug);
  if (!offer) return <Navigate to="/" replace />;
  return (
    <Navigate
      to={{ pathname: "/", hash: `#${offerSectionId(offer.slug)}` }}
      replace
    />
  );
};

export default OfferPage;
