// related files:
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/pages/public/components/PublicPageLayout.tsx
// - web/frontend/src/features/landing/landingTheme.ts
import { useInView } from "react-intersection-observer";
import {
  CheckCircle,
  Clock8,
  Layers,
  Receipt,
  Send,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import {
  landingFeatures,
  landingIdentity,
  landingPipeline,
  landingTheme,
  whyAbutsPoints,
} from "./landingTheme";

const FEATURE_ICONS = [Layers, Clock8, Shield, Receipt] as const;

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
      <div ref={ref} className="mx-auto max-w-6xl space-y-10 px-4 py-12 sm:space-y-12 sm:px-6 sm:py-14 lg:py-16">
        <div
          className={`mx-auto max-w-2xl text-center transition-all duration-700 ${
            inView ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
          }`}
        >
          <h2 className="text-2xl font-semibold text-white md:text-3xl">
            플랫폼 장점
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/65 md:text-base">
            {landingIdentity.identity}
          </p>
        </div>

        <div
          className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${
            inView ? "" : "opacity-0"
          }`}
        >
          {landingFeatures.map((feature, index) => {
            const Icon = FEATURE_ICONS[index] ?? Shield;
            return (
              <Card
                key={feature.title}
                className={`${landingTheme.featureCard} transition-all duration-700 ${
                  inView
                    ? "translate-y-0 opacity-100"
                    : "translate-y-6 opacity-0"
                }`}
                style={{ transitionDelay: `${80 + index * 60}ms` }}
              >
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900/5">
                    <Icon className="h-5 w-5 text-slate-900" />
                  </div>
                  <CardTitle className="text-base">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-relaxed text-slate-600">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div
          className={`grid gap-4 lg:grid-cols-3 ${
            inView ? "" : "opacity-0"
          }`}
        >
          {landingPipeline.map((stage, index) => (
            <Card
              key={stage.step}
              className={`${landingTheme.pipelineCard} transition-all duration-700 ${
                inView
                  ? "translate-y-0 opacity-100"
                  : "translate-y-6 opacity-0"
              }`}
              style={{ transitionDelay: `${200 + index * 80}ms` }}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.5em] text-slate-400">
                    {stage.step}
                  </p>
                  <CheckCircle className="h-4 w-4 text-primary" />
                </div>
                <CardTitle className="text-lg">{stage.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600">{stage.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div
          className={`grid gap-5 lg:grid-cols-2 ${
            inView ? "" : "opacity-0"
          }`}
        >
          <Card
            id="support"
            className={`${landingTheme.statCard} transition-all duration-700 ${
              inView ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
            }`}
            style={{ transitionDelay: "360ms" }}
          >
            <CardHeader className="space-y-2">
              <CardTitle className="text-xl">운영팀과 바로 연결</CardTitle>
              <CardDescription className="text-slate-600">
                가입 이전에도 궁금한 내용을 남기면 담당자가 메일로
                답변드립니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  className="h-11 flex-1 rounded-full bg-slate-900 text-white hover:bg-slate-800"
                  onClick={() => navigate("/login")}
                >
                  Demo 계정으로 보기
                </Button>
                <Button
                  className="h-11 flex-1 rounded-full bg-slate-200 font-semibold text-slate-900 hover:bg-slate-100"
                  onClick={onContact}
                >
                  문의 남기기
                  <Send className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card
            className={`border-white/15 bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-900/80 text-white shadow-[0_30px_70px_rgba(1,2,10,0.5)] backdrop-blur-2xl transition-all duration-700 ${
              inView ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
            }`}
            style={{ transitionDelay: "420ms" }}
          >
            <CardHeader>
              <CardTitle className="text-xl">30초 피치</CardTitle>
              <CardDescription className="text-white/70">
                영업·소개에 바로 쓸 수 있는 한 문단입니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-relaxed text-white/85">
                {landingIdentity.pitch30s}
              </p>
              <ul className="space-y-3">
                {whyAbutsPoints.map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/70" />
                    <p className="text-sm text-white/80">{point}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};
