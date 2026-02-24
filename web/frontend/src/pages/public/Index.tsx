import { useState } from "react";
import { Navigation } from "@/features/layout/Navigation";
import { Footer } from "@/features/landing/Footer";
import { GuestChatModal } from "@/features/support/components/GuestChatModal";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Shield,
  Zap,
  Clock8,
  MessageSquare,
  ArrowRight,
  Layers,
  CheckCircle,
  Send,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";

const Index = () => {
  const [showGuestChat, setShowGuestChat] = useState(false);
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const stats = [
    { label: "월간 케이스", value: "1,500+" },
    { label: "평균 처리 시간", value: "24h 이내" },
    { label: "동기화 성공률", value: "98.7%" },
  ];

  const features = [
    {
      icon: Shield,
      title: "제조 품질 보증",
      description:
        "제조 단계마다 검사·승인 절차를 거쳐 일관된 품질을 제공합니다.",
    },
    {
      icon: Layers,
      title: "통합 워크플로우",
      description: "의뢰·제작·배송까지 단일 대시보드에서 관리하세요.",
    },
    {
      icon: Clock8,
      title: "실시간 상태 추적",
      description: "스테이지 기반 타임라인으로 작업 현황을 즉시 확인합니다.",
    },
    {
      icon: MessageSquare,
      title: "비동기 지원",
      description: "문의는 이메일/메신저로 답변되어 운영에 방해되지 않습니다.",
    },
  ];

  const pipeline = [
    {
      step: "01",
      title: "의뢰 등록",
      body: "STL 파일 업로드 및 의뢰 메타 입력",
    },
    { step: "02", title: "제조 진행", body: "제조 스테이지별 승인·피드백" },
    { step: "03", title: "배송 & 추적", body: "가상 우편함·실시간 배송 추적" },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030711] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 -right-32 h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-blue-500/35 via-cyan-400/22 to-emerald-300/22 blur-[200px]" />
        <div className="absolute bottom-0 left-[-120px] h-[24rem] w-[24rem] rounded-full bg-gradient-to-br from-purple-500/35 via-pink-500/22 to-orange-400/16 blur-[200px]" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.45) 1px, transparent 0)",
            backgroundSize: "90px 90px",
          }}
        />
      </div>

      <Navigation />

      <main className="relative z-10 mx-auto flex max-w-6xl flex-col gap-16 px-4 py-16 lg:py-24 mt-6">
        <section className="flex flex-col gap-12 lg:flex-row lg:items-center">
          <div className="space-y-6 text-center lg:w-1/2 lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1 text-xs uppercase tracking-[0.35em] text-white/70">
              <span>platform</span>
              <span className="h-1 w-1 rounded-full bg-emerald-300" />
              <span>abuts.fit</span>
            </div>
            <div className="space-y-4">
              <h1 className="text-3xl font-semibold leading-tight md:text-4xl">
                치과기공소와 제조사가 함께 쓰는
                <br />
                디지털 제작 워크스페이스
              </h1>
              <p className="text-base text-white/80">
                의뢰, 제조, 배송 과정을 하나의 실시간 스테이지로 정리해 작업
                흐름을 투명하게 공유합니다. 언제든 로그인하면 현재 상태와 필요한
                다음 액션을 확인할 수 있습니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                className="flex-1 basis-[calc(50%-0.75rem)] h-14 rounded-full bg-white text-slate-900 hover:bg-white/90 sm:basis-auto"
                onClick={() =>
                  navigate(isAuthenticated ? "/dashboard" : "/signup")
                }
              >
                지금 가입하기
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="flex-1 basis-[calc(50%-0.75rem)] h-14 rounded-full border-white/40 bg-transparent text-white hover:bg-white/10 sm:basis-auto"
                onClick={() =>
                  navigate(isAuthenticated ? "/dashboard" : "/login")
                }
              >
                로그인
              </Button>
            </div>
          </div>

          <div className="lg:w-1/2">
            <Card className="border-white/15 bg-white/90 text-slate-900 shadow-[0_25px_65px_rgba(7,7,19,0.35)] backdrop-blur-2xl">
              <CardHeader>
                <CardTitle className="text-xl">abuts.fit Snapshot</CardTitle>
                <CardDescription className="text-sm text-slate-500">
                  제조 파트너들이 매일 확인하는 핵심 지표
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {stats.map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-2xl border border-slate-200/60 bg-white/80 p-4 text-center"
                    >
                      <p className="text-3xl font-semibold text-slate-900">
                        {stat.value}
                      </p>
                      <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
                        {stat.label}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-4">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="border-white/10 bg-white/90 text-slate-900 shadow-[0_18px_45px_rgba(6,8,20,0.35)] backdrop-blur-2xl"
            >
              <CardHeader className="flex flex-row items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900/5">
                  <feature.icon className="h-6 w-6 text-slate-900" />
                </div>
                <CardTitle className="text-lg font-semibold">
                  {feature.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm text-slate-600">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          {pipeline.map((stage) => (
            <Card
              key={stage.step}
              className="border-white/10 bg-gradient-to-br from-white/95 to-white/80 text-slate-900 shadow-[0_20px_50px_rgba(6,8,20,0.35)] backdrop-blur-2xl"
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.5em] text-slate-400">
                    {stage.step}
                  </p>
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                </div>
                <CardTitle className="text-lg">{stage.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600">{stage.body}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section id="support" className="grid gap-6 lg:grid-cols-2">
          <Card className="border-white/15 bg-white/90 text-slate-900 shadow-[0_30px_70px_rgba(6,8,20,0.4)] backdrop-blur-2xl">
            <CardHeader className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.4em] text-slate-400">
                support
                <span className="h-1 w-1 rounded-full bg-emerald-400" />
              </div>
              <CardTitle className="text-2xl">운영팀과 바로 연결</CardTitle>
              <CardDescription className="text-base text-slate-600">
                가입 이전에도 궁금한 내용을 남기면 담당자가 메일로 답변드립니다.
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
                  className="h-11 flex-1 rounded-full bg-slate-300 text-slate-900 font-semibold shadow-lg transition-all hover:bg-slate-200"
                  onClick={() => setShowGuestChat(true)}
                >
                  문의 남기기
                  <Send className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/15 bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-900/80 text-white shadow-[0_30px_70px_rgba(1,2,10,0.7)] backdrop-blur-2xl">
            <CardHeader>
              <CardTitle className="text-2xl">왜 abuts.fit인가요?</CardTitle>
              <CardDescription className="text-white/70">
                제조사는 생산성, 의뢰자는 투명성을 얻습니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                <p className="text-sm text-white/80">
                  스테이지 그룹 기반 가시성으로 제조 요청 우선순위를 즉시 조정
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                <p className="text-sm text-white/80">
                  자동 가상 우편함 배치로 배송 동선과 추적 경험 개선
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                <p className="text-sm text-white/80">
                  MongoDB·S3에 저장되는 SSOT 구조로 모든 기록을 안전하게 보관
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      <Footer />
      <GuestChatModal open={showGuestChat} onOpenChange={setShowGuestChat} />
    </div>
  );
};

export default Index;
