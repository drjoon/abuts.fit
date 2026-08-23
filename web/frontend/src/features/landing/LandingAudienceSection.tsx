// related files:
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/shared/business/requestorCapabilities.ts
import { ArrowRight, Building2, Stethoscope } from "lucide-react";
import { useInView } from "react-intersection-observer";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveEntryDashboardPath } from "@/shared/navigation/lastDashboardPath";
import { landingAudiences, landingTheme } from "./landingTheme";

type Audience = (typeof landingAudiences)[number];

const AUDIENCE_ICON = {
  practice: Stethoscope,
  lab: Building2,
} as const;

export const LandingAudienceSection = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const entryPath = resolveEntryDashboardPath(user);
  const { ref, inView } = useInView({ threshold: 0.08, triggerOnce: true });

  const goSignup = () => {
    navigate(isAuthenticated ? entryPath : "/signup");
  };

  return (
    <section
      id="audience"
      className="relative border-t border-white/[0.06]"
    >
      <div ref={ref} className="mx-auto max-w-6xl space-y-8 px-4 py-12 sm:space-y-10 sm:px-6 sm:py-14 lg:py-16">
        <div
          className={`mx-auto max-w-2xl text-center transition-all duration-700 ${
            inView ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
          }`}
        >
          <p
            className={`inline-flex rounded-full px-4 py-1.5 text-xs font-medium tracking-[0.2em] ${landingTheme.glass} ${landingTheme.accentText}`}
          >
            FOR PRACTICE &amp; LAB
          </p>
          <h2 className="mt-4 text-2xl font-semibold text-white md:text-3xl">
            역할별 혜택
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/65 md:text-base">
            치과는 의뢰와 추적을, 기공소는 접수와 CNC 연결을 — 각자 필요한
            이유로 abuts.fit을 씁니다.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {landingAudiences.map((audience, index) => (
            <AudienceCard
              key={audience.id}
              audience={audience}
              inView={inView}
              delayMs={120 + index * 80}
              onCta={goSignup}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

function AudienceCard({
  audience,
  inView,
  delayMs,
  onCta,
}: {
  audience: Audience;
  inView: boolean;
  delayMs: number;
  onCta: () => void;
}) {
  const Icon = AUDIENCE_ICON[audience.id];

  return (
    <article
      className={`flex flex-col rounded-2xl border border-white/12 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-2xl transition-all duration-700 sm:p-6 md:p-8 ${
        inView ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      }`}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-white/45">
            {audience.shortLabel}
          </p>
          <p className="text-sm font-medium text-white/80">
            {audience.roleLabel}
          </p>
        </div>
      </div>

      <h3 className="mt-5 text-xl font-semibold leading-snug text-white md:text-2xl">
        {audience.headline}
      </h3>
      <p className={`mt-2 text-sm font-medium ${landingTheme.accentText}`}>
        {audience.subheadline}
      </p>
      <p className="mt-4 text-sm leading-relaxed text-white/65">
        {audience.pitch}
      </p>

      <ul className="mt-6 flex-1 space-y-2.5">
        {audience.benefits.map((benefit) => (
          <li key={benefit} className="flex items-start gap-2.5 text-sm text-white/80">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/80" />
            <span>{benefit}</span>
          </li>
        ))}
      </ul>

      <Button
        className={`mt-7 h-11 w-full font-semibold ${landingTheme.ctaPrimary}`}
        onClick={onCta}
      >
        {audience.cta}
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </article>
  );
}
