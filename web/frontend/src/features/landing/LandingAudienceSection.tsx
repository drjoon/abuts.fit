// related files:
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/shared/sales/platformPitchBlocks.tsx
import { ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveEntryDashboardPath } from "@/shared/navigation/lastDashboardPath";
import {
  PlatformPitchAudienceCards,
  PlatformPitchHero,
  PlatformPitchStatGrid,
  PlatformPitchWhyGrid,
  type PlatformPitchStats,
} from "@/shared/sales/platformPitchBlocks";
import {
  landingAudienceLab,
  landingAudiencePractice,
} from "./landingTheme";

export const LandingAudienceSection = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const entryPath = resolveEntryDashboardPath(user);
  const { ref, inView } = useInView({ threshold: 0.08, triggerOnce: true });

  const { data, isLoading } = useQuery({
    queryKey: ["public-platform-pitch"],
    staleTime: 60_000,
    queryFn: async () => {
      const res = await apiFetch<{
        success?: boolean;
        data?: PlatformPitchStats;
        message?: string;
      }>({
        path: "/api/system/platform-pitch",
        method: "GET",
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "플랫폼 소개 통계 조회에 실패했습니다.");
      }
      return res.data.data || {};
    },
    retry: false,
  });

  const goSignup = () => {
    navigate(isAuthenticated ? entryPath : "/signup");
  };

  return (
    <section id="audience" className="relative border-t border-white/[0.06]">
      <div
        ref={ref}
        className={`mx-auto max-w-6xl space-y-4 px-4 py-12 sm:space-y-5 sm:px-6 sm:py-14 lg:py-16 transition-all duration-700 ${
          inView ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
        }`}
      >
        <PlatformPitchHero title="치과 · 기공소, 각자의 이유로" />
        <PlatformPitchStatGrid stats={data} isLoading={isLoading} />
        <PlatformPitchWhyGrid />
        <PlatformPitchAudienceCards
          practiceFooter={
            <Button
              className="h-11 w-full rounded-full bg-sky-600 font-semibold text-white hover:bg-sky-500"
              onClick={goSignup}
            >
              {landingAudiencePractice.cta}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          }
          labFooter={
            <Button
              className="h-11 w-full rounded-full bg-emerald-600 font-semibold text-white hover:bg-emerald-500"
              onClick={goSignup}
            >
              {landingAudienceLab.cta}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          }
        />
      </div>
    </section>
  );
};
