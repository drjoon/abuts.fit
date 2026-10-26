// related files:
// - web/frontend/src/pages/public/AbutsLabEventPage.tsx
// - web/frontend/src/features/landing/LandingOfferPage.tsx
// - web/frontend/src/shared/events/abutsLabCampaign.ts
//
// 어벗츠기공소 소개(가공 단차 · 코너 · 임상 디자인).
// `/events/abuts-lab` 와 `/offer/lab` 이 같은 본문을 쓴다.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import {
  ABUTS_LAB_CLINICAL_SLIDES,
  ABUTS_LAB_EVENT_PATH,
  ABUTS_LAB_IMAGES,
} from "@/shared/events/abutsLabCampaign";
import { cn } from "@/shared/ui/cn";
import { LandingMagnetic } from "./LandingMagnetic";
import { LandingReveal } from "./LandingReveal";
import { LandingSpotlightCard } from "./LandingSpotlightCard";

const EVENT_MEDIA_CARD_CLASS =
  "h-full overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-gradient-to-b from-white to-[#f4f7fb] p-4 sm:p-5";

/** 단차 구역. 디자인 반쪽(512×416)과 같은 칸에 사진을 맞춘다. */
const MACHINING_FRAME_CLASS =
  "relative aspect-[512/416] overflow-hidden rounded-2xl bg-[#f4f7fb]";

const CORNER_FRAME_CLASS =
  "relative aspect-[512/465] overflow-hidden rounded-2xl bg-[#f4f7fb]";

const APPLY_HREF = `${ABUTS_LAB_EVENT_PATH}#event-apply`;

function HalfImage({
  src,
  alt,
  shift,
  framed,
}: {
  src: string;
  alt: string;
  shift?: boolean;
  /** 가공 사진과 같은 칸 크기로 맞출 때 */
  framed?: boolean;
}) {
  if (!framed) {
    return (
      <div className="overflow-hidden rounded-2xl bg-[#f4f7fb]">
        <img
          src={src}
          alt={alt}
          className={cn("w-[200%] max-w-none", shift && "-translate-x-1/2")}
        />
      </div>
    );
  }
  return (
    <div className={MACHINING_FRAME_CLASS}>
      <img
        src={src}
        alt={alt}
        className={cn(
          "absolute top-0 h-full w-[200%] max-w-none object-cover",
          shift ? "right-0 object-right" : "left-0 object-left",
        )}
      />
    </div>
  );
}

function PhotoFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className={MACHINING_FRAME_CLASS}>
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
    </div>
  );
}

/** 가운데 한 장. 양옆 슬라이드가 조금 보이게 넘겨 본다. */
function ClinicalDesignSlideshow() {
  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(0);
  const count = ABUTS_LAB_CLINICAL_SLIDES.length;

  useEffect(() => {
    if (!api) return undefined;
    const sync = () => setIndex(api.selectedScrollSnap());
    sync();
    api.on("select", sync);
    api.on("reInit", sync);
    return () => {
      api.off("select", sync);
      api.off("reInit", sync);
    };
  }, [api]);

  return (
    <div className="min-w-0">
      <div className="mx-auto mb-2 grid w-[78%] grid-cols-2 text-center text-xs font-semibold text-slate-600 sm:text-sm">
        <p>기존 디자인</p>
        <p>어벗츠 디자인</p>
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute left-1/2 top-0 z-10 w-[78%] -translate-x-1/2">
          <div className="relative aspect-[1024/390]">
            <button
              type="button"
              className="pointer-events-auto absolute left-0 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-800 shadow-md ring-1 ring-slate-200/80 hover:bg-white"
              aria-label="이전 디자인"
              onClick={() => api?.scrollPrev()}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="pointer-events-auto absolute right-0 top-1/2 flex h-9 w-9 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-800 shadow-md ring-1 ring-slate-200/80 hover:bg-white"
              aria-label="다음 디자인"
              onClick={() => api?.scrollNext()}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <Carousel
          setApi={setApi}
          opts={{ align: "center", loop: true, containScroll: false }}
          className="w-full cursor-grab select-none active:cursor-grabbing"
          aria-label="기존 디자인과 어벗츠 디자인 비교"
        >
          <CarouselContent className="-ml-2">
            {ABUTS_LAB_CLINICAL_SLIDES.map((src, i) => (
              <CarouselItem key={src} className="basis-[78%] pl-2">
                <div className="relative aspect-[1024/390] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.07)]">
                  <img
                    src={src}
                    alt={
                      i === index
                        ? "기존 디자인과 어벗츠 디자인"
                        : ""
                    }
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </div>
      <div className="mt-3 flex justify-center gap-1.5">
        {ABUTS_LAB_CLINICAL_SLIDES.map((src, i) => (
          <button
            key={src}
            type="button"
            aria-label={`${i + 1}번째 비교`}
            aria-current={i === index ? "true" : undefined}
            className={cn(
              "h-1.5 rounded-full",
              i === index ? "w-5 bg-slate-900/80" : "w-1.5 bg-slate-900/25",
            )}
            onClick={() => api?.scrollTo(i)}
          />
        ))}
      </div>
      <p className="sr-only">
        {index + 1} / {count}
      </p>
    </div>
  );
}

function MediaCardTitle({ children }: { children: string }) {
  return (
    <p className="mt-4 break-keep text-center text-lg font-semibold text-slate-900">
      {children}
    </p>
  );
}

function ApplyButton({ onApply }: { onApply?: () => void }) {
  const className =
    "landing-btn h-12 w-full rounded-full bg-[#2563eb] px-7 text-base font-semibold text-white shadow-[0_12px_32px_rgba(37,99,235,0.28)] hover:bg-[#1d4ed8] sm:w-auto";
  if (onApply) {
    return (
      <Button type="button" size="lg" className={className} onClick={onApply}>
        상담 신청하기
        <ArrowDown className="ml-2 h-4 w-4" />
      </Button>
    );
  }
  return (
    <Button asChild type="button" size="lg" className={className}>
      <Link to={APPLY_HREF}>
        상담 신청하기
        <ArrowDown className="ml-2 h-4 w-4" />
      </Link>
    </Button>
  );
}

/** 가공 단차 · 코너 · 임상 디자인. 이벤트 페이지의 신청 폼은 포함하지 않는다. */
export function AbutsLabIntroSections({
  onApply,
}: {
  /** 있으면 그 자리에서 신청으로 스크롤. 없으면 이벤트 신청으로 이동. */
  onApply?: () => void;
}) {
  return (
    <>
      <section
        id="offer-lab"
        data-rail-label="가공"
        className="scroll-mt-20 border-b border-slate-100 bg-white py-16 sm:py-20"
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <LandingReveal>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
              Machining
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              단차 있는 곡면
            </h2>
            <p className="mt-4 max-w-xl break-keep text-sm leading-relaxed text-slate-600 sm:max-w-2xl sm:text-base">
              기공사 선생님이 성의껏 디자인해 주셔도, 가공하면 단차가 발생할 수
              있습니다.
              <br />
              어벗츠 소프트웨어 덕분에 매끈하게 가공됩니다.
            </p>
          </LandingReveal>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <LandingReveal>
              <LandingSpotlightCard className={EVENT_MEDIA_CARD_CLASS}>
                <HalfImage
                  src={ABUTS_LAB_IMAGES.design}
                  alt="기존 디자인"
                  framed
                />
                <MediaCardTitle>기존 디자인</MediaCardTitle>
              </LandingSpotlightCard>
            </LandingReveal>
            <LandingReveal delay={90}>
              <LandingSpotlightCard className={EVENT_MEDIA_CARD_CLASS}>
                <PhotoFrame
                  src={ABUTS_LAB_IMAGES.step}
                  alt="기존 가공. 가공 후 단차가 남은 어벗먼트입니다."
                />
                <MediaCardTitle>기존 가공</MediaCardTitle>
              </LandingSpotlightCard>
            </LandingReveal>
            <LandingReveal delay={120}>
              <LandingSpotlightCard className={EVENT_MEDIA_CARD_CLASS}>
                <HalfImage
                  src={ABUTS_LAB_IMAGES.design}
                  alt="어벗츠 디자인"
                  shift
                  framed
                />
                <MediaCardTitle>어벗츠 디자인</MediaCardTitle>
              </LandingSpotlightCard>
            </LandingReveal>
            <LandingReveal delay={180}>
              <LandingSpotlightCard className={EVENT_MEDIA_CARD_CLASS}>
                <PhotoFrame
                  src={ABUTS_LAB_IMAGES.smooth}
                  alt="어벗츠 가공. 곡면 처리 후 매끈하게 가공된 어벗먼트입니다."
                />
                <MediaCardTitle>어벗츠 가공</MediaCardTitle>
              </LandingSpotlightCard>
            </LandingReveal>
          </div>
        </div>
      </section>

      <section
        id="abutment-corner"
        data-rail-label="코너"
        className="scroll-mt-20 border-b border-slate-100 bg-[#f7f9fc] py-16 sm:py-20"
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <LandingReveal>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
              Corner
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              공구보다 작은 코너
            </h2>
            <p className="mt-4 max-w-xl break-keep text-sm leading-relaxed text-slate-600 sm:max-w-2xl sm:text-base">
              마진과 축면이 만나는 코너가 공구보다 작으면 그 자리는 움푹 패여
              나옵니다.
              <br />
              어벗츠 소프트웨어는 필레 반지름을 재서, 작으면 디자인 파일 업로드
              즉시 알려줍니다.
            </p>
          </LandingReveal>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <LandingReveal>
              <LandingSpotlightCard className={EVENT_MEDIA_CARD_CLASS}>
                <div className={CORNER_FRAME_CLASS}>
                  <img
                    src={ABUTS_LAB_IMAGES.fillet}
                    alt="필레 반지름 경고"
                    className="absolute top-0 right-0 h-full w-[200%] max-w-none object-cover object-right"
                  />
                </div>
                <MediaCardTitle>필레 반지름 경고</MediaCardTitle>
              </LandingSpotlightCard>
            </LandingReveal>
            <LandingReveal delay={90}>
              <LandingSpotlightCard className={EVENT_MEDIA_CARD_CLASS}>
                <div className={CORNER_FRAME_CLASS}>
                  <img
                    src={ABUTS_LAB_IMAGES.gouge}
                    alt="움푹 패인 가공. 코너가 패여 가공된 어벗먼트입니다."
                    className="absolute inset-0 h-full w-full object-cover object-center"
                  />
                </div>
                <MediaCardTitle>움푹 패인 가공</MediaCardTitle>
              </LandingSpotlightCard>
            </LandingReveal>
          </div>
        </div>
      </section>

      <section
        id="abutment-design"
        data-rail-label="함께"
        className="scroll-mt-20 border-b border-sky-100 bg-[#eef6ff] py-16 sm:py-20"
      >
        <div className="grid items-center gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(18rem,42rem)_minmax(18rem,1fr)] lg:gap-10 lg:pl-[max(2rem,calc((100%-64rem)/2+2rem))] lg:pr-8">
          <LandingReveal>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
              Design
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              임상에 맞춘 디자인
            </h2>
            <p className="mt-4 max-w-xl break-keep text-sm leading-relaxed text-slate-600 sm:max-w-2xl sm:text-base">
              수많은 커스텀 어벗 디자인을 분석했습니다.
              <br />
              단차와 코너는 어벗츠가 해결한 많은 문제 중 하나이며, 어벗츠는 이런
              문제를 계속 풀어 갑니다.
            </p>
            <p className="mt-6 break-keep text-lg font-semibold tracking-tight text-slate-900">
              어벗츠와 함께하시겠습니까?
            </p>
            <div className="mt-6 w-full sm:w-auto">
              <LandingMagnetic>
                <ApplyButton onApply={onApply} />
              </LandingMagnetic>
            </div>
          </LandingReveal>
          <LandingReveal delay={90} className="min-w-0">
            <ClinicalDesignSlideshow />
          </LandingReveal>
        </div>
      </section>
    </>
  );
}
