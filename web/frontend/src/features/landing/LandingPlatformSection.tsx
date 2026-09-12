// related files:
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/pages/public/components/PublicPageLayout.tsx
// - web/frontend/src/features/landing/landingTheme.ts
import { Send } from "lucide-react";
import { useInView } from "react-intersection-observer";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";
import { landingFlowSteps, landingIdentity, landingTheme } from "./landingTheme";

interface LandingPlatformSectionProps {
  onContact: () => void;
}

export const LandingPlatformSection = ({
  onContact,
}: LandingPlatformSectionProps) => {
  const navigate = useNavigate();
  const { ref, inView } = useInView({ threshold: 0.08, triggerOnce: true });

  return (
    <section
      id="platform-details"
      className="relative border-t border-white/[0.06]"
    >
      <div
        ref={ref}
        className="mx-auto max-w-6xl space-y-12 px-4 py-14 sm:px-6 sm:py-16 lg:py-20"
      >
        <div
          className={cn(
            "mx-auto max-w-2xl text-center transition-all duration-700",
            inView ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
          )}
        >
          <p
            className={`inline-flex rounded-full px-3.5 py-1 text-[11px] tracking-[0.18em] text-white/55 ${landingTheme.glass}`}
          >
            FLOW
          </p>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            세 단계로 끝나는 제작 흐름
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/60 sm:text-base">
            {landingIdentity.vision}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {landingFlowSteps.map((stage, index) => (
            <div
              key={stage.step}
              className={cn(
                "relative p-5 transition-all duration-700 sm:p-6",
                landingTheme.panelSoft,
                inView ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
              )}
              style={{ transitionDelay: `${100 + index * 70}ms` }}
            >
              <p className="text-[11px] tracking-[0.28em] text-white/35">
                {stage.step}
              </p>
              <h3 className="mt-3 text-lg font-semibold text-white">
                {stage.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                {stage.body}
              </p>
            </div>
          ))}
        </div>

        <div
          id="support"
          className={cn(
            "flex flex-col items-start justify-between gap-5 p-6 transition-all duration-700 sm:flex-row sm:items-center sm:p-7",
            landingTheme.panel,
            inView ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
          )}
          style={{ transitionDelay: "320ms" }}
        >
          <div className="space-y-1.5">
            <h3 className="text-lg font-semibold text-white">
              먼저 둘러보거나, 물어보세요
            </h3>
            <p className="text-sm text-white/55">
              Demo로 화면을 보거나, 가입 전에도 문의할 수 있습니다.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
            <Button
              className={`h-11 px-6 font-semibold ${landingTheme.ctaPrimary}`}
              onClick={() => navigate("/login")}
            >
              Demo 계정으로 보기
            </Button>
            <Button
              className={`h-11 px-6 ${landingTheme.ctaGhost}`}
              onClick={onContact}
            >
              문의 남기기
              <Send className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};
