// related files:
// - web/frontend/src/pages/public/OfferPage.tsx
// - web/frontend/src/features/landing/landingOffers.ts
// - web/frontend/src/features/landing/OfferVisual.tsx
import { Link, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveEntryDashboardPath } from "@/shared/navigation/lastDashboardPath";
import { cn } from "@/shared/ui/cn";
import { OfferVisual } from "./OfferVisual";
import {
  landingOffers,
  offerPath,
  type LandingOffer,
  type OfferSection,
  type OfferVisual as OfferVisualModel,
} from "./landingOffers";

/** 긴 문장은 한 줄. 짧은 문장만 2~3열. 4열은 쓰지 않는다. */
function packSectionRows(sections: OfferSection[]) {
  const rows: OfferSection[][] = [];
  let bucket: OfferSection[] = [];
  const flush = (size: number) => {
    while (bucket.length > size) {
      rows.push(bucket.splice(0, size));
    }
    if (bucket.length) {
      rows.push(bucket);
      bucket = [];
    }
  };
  for (const section of sections) {
    if (section.body.length >= 88) {
      flush(2);
      rows.push([section]);
      continue;
    }
    bucket.push(section);
  }
  flush(bucket.length === 3 ? 3 : 2);
  return rows;
}

function OverlayCopy({
  eyebrow,
  title,
  body,
  as = "h2",
}: {
  eyebrow?: string;
  title: string;
  body: string;
  as?: "h1" | "h2";
}) {
  const Title = as;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-6 pb-8 pt-28 sm:px-10 sm:pb-10 lg:px-14">
      {eyebrow ? (
        <p className="text-xs font-semibold tracking-[0.18em] text-white/80">
          {eyebrow}
        </p>
      ) : null}
      <Title
        className={cn(
          "max-w-3xl font-semibold tracking-tight text-white",
          as === "h1"
            ? "mt-3 text-4xl sm:text-6xl"
            : "mt-2 text-3xl sm:text-5xl",
        )}
      >
        {title}
      </Title>
      <p className="mt-3 max-w-xl text-base leading-relaxed text-white/90 sm:text-lg">
        {body}
      </p>
    </div>
  );
}

function BleedFrame({
  visual,
  minH,
  children,
}: {
  visual: OfferVisualModel;
  minH: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("relative overflow-hidden", minH)}>
      <div className="absolute inset-0">
        <OfferVisual visual={visual} tile className="h-full min-h-0" />
      </div>
      {children}
    </section>
  );
}

function StoryCard({
  section,
  wide,
}: {
  section: OfferSection;
  wide: boolean;
}) {
  return (
    <article
      className={cn(
        "overflow-hidden rounded-[1.5rem] bg-white",
        wide && "lg:grid lg:grid-cols-12",
      )}
    >
      <div
        className={cn(
          "overflow-hidden bg-[#e7e9ee]",
          wide ? "h-56 lg:col-span-5 lg:h-full lg:min-h-[18rem]" : "h-52 sm:h-56",
        )}
      >
        <OfferVisual
          visual={section.visual}
          className="h-full min-h-0 [&_img]:max-h-full"
        />
      </div>
      <div
        className={cn(
          "px-6 py-6 sm:px-8 sm:py-8",
          wide && "flex flex-col justify-center lg:col-span-7 lg:px-10 lg:py-10",
        )}
      >
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          {section.title}
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
          {section.body}
        </p>
      </div>
    </article>
  );
}

export function LandingOfferPage({ offer }: { offer: LandingOffer }) {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const others = landingOffers.filter((item) => item.slug !== offer.slug);

  return (
    <div className="bg-[#f3f4f6] px-4 pb-12 pt-24 text-slate-900 sm:px-6 lg:px-10">
      <BleedFrame
        visual={offer.tile}
        minH="min-h-[22rem] overflow-hidden rounded-[1.5rem] sm:min-h-[26rem] lg:min-h-[32rem]"
      >
        <OverlayCopy
          as="h1"
          eyebrow={offer.navLabel}
          title={offer.punch}
          body={offer.lead}
        />
      </BleedFrame>

      <div className="mt-6 space-y-6 sm:mt-8">
        {packSectionRows(offer.sections).map((row) => (
          <div
            key={row[0]?.title}
            className={cn(
              "grid gap-6",
              row.length === 3 && "lg:grid-cols-3",
              row.length === 2 && "md:grid-cols-2",
            )}
          >
            {row.map((section) => (
              <StoryCard
                key={section.title}
                section={section}
                wide={row.length === 1}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 px-6 py-8 sm:px-10 lg:px-16">
        <Button
          type="button"
          className="h-11 rounded-full bg-[#2563eb] px-6 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
          onClick={() =>
            navigate(
              isAuthenticated ? resolveEntryDashboardPath(user) : "/signup",
            )
          }
        >
          시작하기
        </Button>
        {offer.slug === "platform" || offer.slug === "simple-way" ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-full border-slate-300 bg-white px-6 text-sm font-semibold"
            onClick={() => navigate("/platform#store")}
          >
            스토어 보기
          </Button>
        ) : null}
      </div>

      <section
        className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
      >
        {others.map((item) => (
          <Link
            key={item.slug}
            to={offerPath(item.slug)}
            className="group relative block min-h-[16rem] overflow-hidden rounded-[1.5rem] bg-[#e7e9ee]"
          >
            <div className="absolute inset-0 transition duration-500 group-hover:scale-[1.02]">
              <OfferVisual visual={item.tile} tile className="h-full min-h-0" />
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-5 pb-5 pt-16">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-white/80">
                {item.navLabel}
              </p>
              <p className="mt-1.5 text-2xl font-semibold tracking-tight text-white">
                {item.punch}
              </p>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
