// change-log:
// - 2026-10-06: 월말 과오입금 카톡 사례 — 원본 캡처·실명 없이 재구성 대화 목업.
// related files:
// - web/frontend/src/features/landing/platformOfferContent.ts
// - web/frontend/src/features/landing/PlatformOfferSections.tsx
// - web/frontend/src/features/landing/LandingOfferPage.tsx
import { ChevronLeft, FileSpreadsheet } from "lucide-react";
import { cn } from "@/shared/ui/cn";
import {
  landingContent,
  landingProse,
  landingSectionY,
  landingSky,
  landingTypo,
} from "./landingTheme";
import type { PlatformOfferExtras, PlatformCaseMessage } from "./platformOfferContent";
import { LandingReveal } from "./LandingReveal";
import { LandingSpotlightCard } from "./LandingSpotlightCard";
import { Lines, SectionEyebrow } from "./landingText";

const SKY = landingSky;
const TYPO = landingTypo;

function KakaoBubble({
  message,
  showTime,
}: {
  message: PlatformCaseMessage;
  showTime: boolean;
}) {
  const isPractice = message.from === "practice";
  const time = (
    <span className="mt-auto mb-0.5 shrink-0 text-[10px] leading-none text-[#3b4a5a]/80">
      {message.time}
    </span>
  );

  return (
    <div
      className={cn(
        "flex w-full items-end gap-1",
        isPractice ? "justify-end" : "justify-start",
      )}
    >
      {isPractice && showTime ? time : null}
      {message.kind === "file" ? (
        <div className="w-[13.5rem] overflow-hidden rounded-2xl rounded-bl-md bg-white shadow-[0_1px_1px_rgba(0,0,0,0.08)]">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eef6ff] text-[#2563eb]">
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-[#191919]">
                {message.fileName}
              </p>
              <p className="text-[11px] text-slate-500">{message.fileMeta}</p>
            </div>
          </div>
          <div
            aria-hidden
            className="space-y-1 border-t border-slate-100 bg-[#f7f8fa] px-3 py-2.5"
          >
            {[72, 90, 58, 84, 64].map((width, index) => (
              <span
                key={index}
                className="block h-1.5 rounded-full bg-slate-200"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
        </div>
      ) : (
        <p
          className={cn(
            "max-w-[15.5rem] break-keep rounded-2xl px-3 py-2 text-[13px] leading-5 shadow-[0_1px_1px_rgba(0,0,0,0.06)]",
            isPractice
              ? "rounded-br-md bg-[#fee500] text-[#191919]"
              : "rounded-bl-md bg-white text-[#191919]",
          )}
        >
          {message.text}
        </p>
      )}
      {!isPractice && showTime ? time : null}
    </div>
  );
}

function KakaoThreadMock({
  headerName,
  headerSub,
  dateLabel,
  messages,
}: {
  headerName: string;
  headerSub: string;
  dateLabel: string;
  messages: readonly PlatformCaseMessage[];
}) {
  return (
    <figure
      className="mx-auto w-full max-w-[21.5rem]"
      aria-label="기공소와 치과의 카카오톡 대화 재구성"
    >
      <div className="overflow-hidden rounded-[1.75rem] border border-slate-800/15 bg-[#1f1f1f] p-[0.55rem] shadow-[0_24px_50px_rgba(15,23,42,0.22)]">
        <div className="overflow-hidden rounded-[1.3rem] bg-[#b2c7d9]">
          <div className="flex items-center justify-between bg-[#b2c7d9] px-4 pb-1 pt-2.5 text-[11px] font-semibold text-[#191919]/80">
            <span>9:41</span>
            <span className="flex items-center gap-1.5" aria-hidden>
              <span className="h-2 w-3.5 rounded-[1px] border border-[#191919]/50" />
              <span className="h-2.5 w-4 rounded-sm border border-[#191919]/50" />
            </span>
          </div>
          <header className="flex items-center gap-2 bg-[#b2c7d9] px-2 pb-2.5 pt-1">
            <ChevronLeft className="h-5 w-5 text-[#191919]" aria-hidden />
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4a6fa3] text-[12px] font-bold text-white">
              기
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold leading-tight text-[#191919]">
                {headerName}
              </p>
              <p className="text-[11px] text-[#3b4a5a]">{headerSub}</p>
            </div>
          </header>
          <div className="space-y-2 bg-[#b2c7d9] px-3 pb-4 pt-1">
            <p className="py-1 text-center text-[11px] font-medium text-[#3b4a5a]">
              {dateLabel}
            </p>
            {messages.map((message, index) => {
              const next = messages[index + 1];
              const showTime =
                !next ||
                next.from !== message.from ||
                next.time !== message.time;
              return (
                <KakaoBubble
                  key={`${message.from}-${index}`}
                  message={message}
                  showTime={showTime}
                />
              );
            })}
          </div>
          <div className="flex items-center gap-2 bg-[#f2f2f2] px-3 py-2.5">
            <span
              aria-hidden
              className="h-7 w-7 rounded-full bg-white ring-1 ring-slate-200"
            />
            <span className="h-8 flex-1 rounded-full bg-white ring-1 ring-slate-200" />
            <span
              aria-hidden
              className="h-7 w-9 rounded-full bg-[#fee500]"
            />
          </div>
        </div>
      </div>
    </figure>
  );
}

/** 월말 수기 정산 과오입금 — 플랫폼이 없애는 현장 사례. */
export function PlatformSettlementCaseSection({
  caseStudy,
}: {
  caseStudy: PlatformOfferExtras["caseStudy"];
}) {
  return (
    <section
      id="settlement-case"
      data-rail-label="사례"
      className={cn("scroll-mt-20 bg-white", landingSectionY.bandTight)}
    >
      <div className={landingContent}>
        <LandingReveal className={cn(landingProse, "text-center")}>
          <SectionEyebrow>{caseStudy.eyebrow}</SectionEyebrow>
          <h2 className={cn(TYPO.h2, "mt-2.5", SKY.ink)}>{caseStudy.title}</h2>
          <Lines lines={caseStudy.lead} className={cn("mt-2.5", TYPO.lead)} />
        </LandingReveal>

        <div className="mt-8 grid items-center gap-6 sm:mt-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-10">
          <LandingReveal>
            <KakaoThreadMock
              headerName={caseStudy.headerName}
              headerSub={caseStudy.headerSub}
              dateLabel={caseStudy.dateLabel}
              messages={caseStudy.messages}
            />
            <p className="mt-3 text-center text-[12px] text-slate-500">
              {caseStudy.caption}
            </p>
          </LandingReveal>

          <LandingReveal delay={120}>
            <div className="grid gap-3">
              <LandingSpotlightCard
                className={cn(SKY.card, "px-5 py-5 sm:px-6")}
              >
                <p
                  className={cn(
                    "text-[11px] font-bold tracking-[0.14em]",
                    SKY.accent,
                  )}
                >
                  현장
                </p>
                <h3 className={cn("mt-1.5 text-base font-semibold sm:text-lg", SKY.ink)}>
                  {caseStudy.problemTitle}
                </h3>
                <Lines lines={caseStudy.problem} className={cn("mt-2", TYPO.body)} />
              </LandingSpotlightCard>
              <LandingSpotlightCard
                className={cn(SKY.card, "border-sky-200 bg-[#f7fbff] px-5 py-5 sm:px-6")}
              >
                <p
                  className={cn(
                    "text-[11px] font-bold tracking-[0.14em]",
                    SKY.accentStrong,
                  )}
                >
                  플랫폼
                </p>
                <h3 className={cn("mt-1.5 text-base font-semibold sm:text-lg", SKY.ink)}>
                  {caseStudy.solveTitle}
                </h3>
                <Lines lines={caseStudy.solve} className={cn("mt-2", TYPO.body)} />
                <a
                  href="#credit"
                  className={cn(
                    "mt-4 inline-flex items-center gap-1 underline-offset-4 hover:underline",
                    TYPO.link,
                    SKY.accentStrong,
                  )}
                >
                  {caseStudy.creditLink}
                </a>
              </LandingSpotlightCard>
            </div>
          </LandingReveal>
        </div>
      </div>
    </section>
  );
}
