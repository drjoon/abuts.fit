// related files:
// - web/frontend/src/features/auth/LoginPage.tsx
// - web/frontend/src/features/auth/SignupPage.tsx
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/features/landing/landingOffers.ts
import { getLandingOffer } from "@/features/landing/landingOffers";
import { landingHome } from "@/features/landing/landingTheme";
import { cn } from "@/shared/ui/cn";

/** 로그인·가입 왼쪽 안내. 카피는 랜딩 히어로·심플웨이 오퍼와 같게 둔다. */
export function AuthMarketingPanel({
  align = "left",
}: {
  align?: "left" | "center";
}) {
  const simpleWay = getLandingOffer("simple-way");

  return (
    <section
      className={cn(
        "hidden w-full space-y-5 text-center sm:block sm:space-y-6 lg:w-1/2 lg:flex-1",
        align === "left" ? "lg:text-left" : "lg:text-center",
      )}
    >
      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs tracking-[0.12em] text-white/70">
        <span>심플웨이</span>
        <span className="h-1 w-1 rounded-full bg-primary/70" />
        <span>abuts.fit</span>
      </div>
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold leading-tight text-white md:text-4xl">
          {landingHome.heroTitle}
        </h1>
        <p className="text-base text-white/80">
          {landingHome.heroBody}
          <br />
          {landingHome.heroSupport}
        </p>
      </div>
      {simpleWay ? (
        <div className="hidden rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur lg:block">
          <p className="text-xs tracking-[0.12em] text-white/60">
            {simpleWay.navLabel}
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {simpleWay.punch}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white/70">
            {simpleWay.line}
          </p>
        </div>
      ) : null}
    </section>
  );
}
