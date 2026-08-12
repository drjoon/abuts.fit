// related files:
// - web/frontend/src/features/lab/LabDashboardTopBanners.tsx
// - web/frontend/src/features/lab/LabTradingPartnerWindowBanner.tsx
// - 2026-08-12: 기공소 가입 이유 배너·모달.
// - 2026-08-12: 이유 모달 본문 2열 → 1열.
import { useState } from "react";
import {
  ChevronRight,
  Factory,
  MailX,
  MessageCircle,
  RefreshCw,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/shared/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  className?: string;
};

const BENEFITS = [
  {
    icon: MailX,
    title: "이제 이메일 쓰지 마세요",
    points: [
      "기공의뢰서·구강스캔 전달과 지난 내역 관리가 한곳에서 끝납니다.",
      "의뢰건별 채팅으로 치과와 바로 소통합니다.",
    ],
  },
  {
    icon: Wallet,
    title: "정산·계산서는 맡기세요",
    points: [
      "입금 내역, 크레딧 잔고, 소비 내역을 플랫폼이 관리합니다.",
      "매달 정산과 계산서 발행까지 함께 처리합니다.",
    ],
  },
  {
    icon: Users,
    title: "거래 치과가 더 필요하세요?",
    points: [
      "실력을 검증해 어벗츠 인증 기공소가 되면, 치과의 자동 매칭 의뢰를 받을 수 있습니다.",
      "더 일하고 싶을 때 더 하고, 쉴 때는 쉬는 유연한 운영이 가능합니다.",
    ],
  },
  {
    icon: Factory,
    title: "커스텀어벗 생산도 맡겨주세요",
    points: [
      "전공정 자동화로 합리적인 가격의 고품질 CNC 커스텀어벗을 생산합니다.",
      "3D 모델·의뢰서 이동과 관리를 플랫폼에서 원스톱으로 처리합니다.",
    ],
  },
  {
    icon: RefreshCw,
    title: "계속 업데이트합니다",
    points: [
      "문의·채팅·메일·전화로 기공소 의견을 듣습니다.",
      "빠른 속도로 서비스를 개선해 나갑니다.",
    ],
  },
] as const;

export const LabPlatformBenefitsBanner = ({ className }: Props) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "flex h-full w-full cursor-pointer items-center gap-3 rounded-xl border border-primary-muted bg-primary-soft px-4 py-3 text-left text-primary-strong transition-colors hover:bg-primary-soft/80 sm:gap-3.5 sm:px-5 sm:py-3.5",
          className,
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/70 ring-1 ring-primary-muted/60">
          <Sparkles className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-base font-semibold leading-snug tracking-tight sm:text-[17px]">
            왜 어벗츠에 가입해야 할까요?
          </p>
          <p className="text-sm leading-relaxed text-primary-strong/85 sm:text-[15px]">
            의뢰·정산·매칭·생산까지 — 클릭해서 자세히 보기
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="text-xl tracking-tight">
              기공소가 어벗츠를 쓰는 이유
            </DialogTitle>
            <DialogDescription className="text-[15px] leading-relaxed text-slate-600">
              이메일·정산·신규 거래·커스텀어벗 생산까지, 기공소 업무를 한곳에서
              이어줍니다.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-1 grid grid-cols-1 gap-3">
            {BENEFITS.map((item, index) => {
              const Icon = item.icon;
              return (
                <section
                  key={item.title}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3.5"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700 ring-1 ring-sky-100">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <h3 className="flex items-baseline gap-2 text-[15px] font-semibold tracking-tight text-slate-900">
                        <span className="tabular-nums text-sky-600">
                          {index + 1}.
                        </span>
                        {item.title}
                      </h3>
                      <ul className="space-y-1.5">
                        {item.points.map((point) => (
                          <li
                            key={point}
                            className="flex gap-2 text-sm leading-relaxed text-slate-600"
                          >
                            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-sky-400" />
                            <span className="min-w-0">{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </section>
              );
            })}

            <p className="flex items-start gap-2 rounded-xl border border-dashed border-sky-200 bg-sky-50/60 px-4 py-3 text-sm leading-relaxed text-slate-700">
              <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
              <span>
                궁금한 점이 있으면 채팅·문의로 편하게 말씀해 주세요. 함께
                맞춰가겠습니다.
              </span>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
