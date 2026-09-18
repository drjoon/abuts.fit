// related files:
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/pages/public/components/PublicPageLayout.tsx
// - web/frontend/src/features/landing/landingTheme.ts
import {
  ArrowRight,
  ClipboardList,
  FilePlus2,
  Package,
  Receipt,
  ShoppingBag,
  Truck,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveEntryDashboardPath } from "@/shared/navigation/lastDashboardPath";
import { cn } from "@/shared/ui/cn";
import { LANDING_PRODUCT_IMAGE } from "./landingAssets";
import {
  landingFlowSteps,
  landingIdentity,
  landingQuickMenus,
  landingTheme,
} from "./landingTheme";

const QUICK_ICONS = {
  request: FilePlus2,
  progress: ClipboardList,
  shipping: Truck,
  store: ShoppingBag,
  orders: Package,
  settlement: Receipt,
} as const;

export const LandingPlatformIntro = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const entryPath = resolveEntryDashboardPath(user);
  const startPath = isAuthenticated ? entryPath : "/signup";
  const accountPath = isAuthenticated ? entryPath : "/login";

  return (
    <section
      id="platform"
      className={`relative scroll-mt-20 border-t border-slate-200/80 sm:scroll-mt-24 ${landingTheme.sectionAlt}`}
    >
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-14 sm:space-y-10 sm:px-6 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className={landingTheme.eyebrow}>PLATFORM</p>
          <h2
            className={`mt-4 text-2xl font-semibold tracking-tight sm:text-3xl ${landingTheme.headline}`}
          >
            제작 의뢰부터 진행 확인까지
          </h2>
          <p
            className={`mt-3 text-sm leading-relaxed sm:text-base ${landingTheme.body}`}
          >
            {landingIdentity.body}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.85fr] lg:gap-5">
          <div
            className={`${landingTheme.panel} relative overflow-hidden p-5 sm:p-7`}
          >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-100/80 via-transparent to-transparent" />
            <div className="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center">
              <div className="space-y-4">
                <h3
                  className={`text-xl font-semibold sm:text-2xl ${landingTheme.headline}`}
                >
                  제작 의뢰부터 진행 확인까지
                </h3>
                <p className={`text-sm leading-relaxed ${landingTheme.body}`}>
                  파일을 등록하고 의뢰를 시작하세요. 제작·배송·정산이 같은
                  타임라인으로 이어집니다.
                </p>
                <Button
                  className={`h-11 px-6 font-semibold ${landingTheme.ctaPrimary}`}
                  onClick={() => navigate(startPath)}
                >
                  제작 의뢰하기
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-[0.9fr_1.1fr] sm:items-center">
                <div
                  className={`${landingTheme.panelSoft} flex flex-col items-center justify-center gap-2 border-dashed px-4 py-6 text-center`}
                >
                  <Upload className={`h-8 w-8 ${landingTheme.accentText}`} />
                  <p className={`text-xs font-medium tracking-wide ${landingTheme.muted}`}>
                    STL · 디자인 파일
                  </p>
                  <p className={`text-[11px] leading-relaxed ${landingTheme.faint}`}>
                    드래그하거나 선택해 업로드
                  </p>
                </div>
                <ol className="space-y-2.5">
                  {landingFlowSteps.map((step) => (
                    <li
                      key={step.step}
                      className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5"
                    >
                      <span
                        className={`mt-0.5 text-[11px] font-semibold tracking-[0.16em] ${landingTheme.accentText}`}
                      >
                        {step.step}
                      </span>
                      <div>
                        <p className={`text-sm font-medium ${landingTheme.headline}`}>
                          {step.title}
                        </p>
                        <p className={`text-xs ${landingTheme.muted}`}>
                          {step.body}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>

          <div
            className={`${landingTheme.panelSoft} relative flex flex-col overflow-hidden p-5 sm:p-6`}
          >
            <div className="relative z-10 flex flex-1 flex-col">
              <p
                className={`text-[11px] font-medium tracking-[0.18em] ${landingTheme.accentText}`}
              >
                어벗츠 스토어
              </p>
              <h3
                className={`mt-2 text-lg font-semibold sm:text-xl ${landingTheme.headline}`}
              >
                필요한 제품을 한곳에서
              </h3>
              <p className={`mt-1.5 text-sm ${landingTheme.muted}`}>
                어벗먼트 · 키트 · 기구
              </p>
              <div className="my-5 flex flex-1 items-center justify-center gap-3">
                <img
                  src={LANDING_PRODUCT_IMAGE}
                  alt="어벗먼트"
                  className="h-24 w-auto object-contain sm:h-28"
                />
                <img
                  src="/store/acrodent/initial-kit.jpg"
                  alt="시술 키트"
                  className="h-24 w-auto object-contain opacity-95 sm:h-28"
                />
              </div>
              <Button
                variant="outline"
                className={`mt-auto h-10 w-full ${landingTheme.ctaGhost}`}
                onClick={() => {
                  const el = document.getElementById("store");
                  if (!el) {
                    navigate(startPath);
                    return;
                  }
                  const top =
                    el.getBoundingClientRect().top + window.scrollY - 80;
                  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
                }}
              >
                제품 구매하기
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 lg:gap-3">
          {landingQuickMenus.map((item) => {
            const Icon = QUICK_ICONS[item.id];
            const href =
              item.href === "/signup"
                ? startPath
                : item.href === "/login"
                  ? accountPath
                  : item.href;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(href)}
                className={cn(
                  "flex flex-col items-center gap-2.5 px-3 py-4 text-center transition hover:border-sky-200 hover:bg-sky-50/60",
                  landingTheme.panelSoft,
                )}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
                  <Icon className="h-5 w-5" />
                </span>
                <span
                  className={`text-xs font-medium sm:text-sm ${landingTheme.headline}`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div
            className={`${landingTheme.panelSoft} flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between`}
          >
            <div>
              <p className={`font-medium ${landingTheme.headline}`}>
                제작 서비스를 이용하시나요?
              </p>
              <p className={`mt-1 text-sm ${landingTheme.muted}`}>
                의뢰 방법과 문의 채널을 확인해 보세요.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className={`h-9 px-4 ${landingTheme.ctaGhost}`}
                onClick={() => navigate("/help")}
              >
                의뢰 방법 보기
              </Button>
              <Button
                variant="outline"
                className={`h-9 px-4 ${landingTheme.ctaGhost}`}
                onClick={() => navigate("/contact")}
              >
                제작 문의
              </Button>
            </div>
          </div>
          <div
            className={`${landingTheme.panelSoft} flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between`}
          >
            <div>
              <p className={`font-medium ${landingTheme.headline}`}>
                이용 내역을 확인하세요
              </p>
              <p className={`mt-1 text-sm ${landingTheme.muted}`}>
                로그인하면 의뢰·주문·정산을 한곳에서 볼 수 있습니다.
              </p>
            </div>
            <Button
              className={`h-9 shrink-0 px-5 font-semibold ${landingTheme.ctaPrimary}`}
              onClick={() => navigate(accountPath)}
            >
              {isAuthenticated ? "대시보드" : "로그인"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};
