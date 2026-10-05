// related files:
// - web/frontend/src/shared/platform/platformBenefitsContent.ts
// - web/frontend/src/features/platform/PlatformBenefitsShareButtons.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorPolicyRemakeHeader.tsx
// - web/frontend/src/features/lab/LabPlatformBenefitsBanner.tsx
// - 2026-10-06: 안내 모달 공통 크롬(정산규칙·정책안내와 동일).
// - 2026-08-12: 기공소·치과 가입 이유 모달.
// - 2026-08-14: 기공소 자동매칭 설정 링크.
// - 2026-08-19: 설정-자동매칭 링크 제거.
import { MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getPlatformBenefitsConfig,
  normalizePlatformBenefitPoint,
  type PlatformBenefitsVariant,
} from "@/shared/platform/platformBenefitsContent";
import { PlatformBenefitsShareButtons } from "@/features/platform/PlatformBenefitsShareButtons";
import {
  GUIDE_DIALOG_BODY_CLASS,
  GUIDE_DIALOG_CONTENT_CLASS,
  GUIDE_DIALOG_HEADER_CLASS,
} from "@/shared/settlement/settlementUi";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: PlatformBenefitsVariant;
};

export const PlatformBenefitsDialog = ({
  open,
  onOpenChange,
  variant,
}: Props) => {
  const config = getPlatformBenefitsConfig(variant);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={GUIDE_DIALOG_CONTENT_CLASS}>
        <DialogHeader className={GUIDE_DIALOG_HEADER_CLASS}>
          <DialogTitle className="text-xl font-semibold tracking-tight text-slate-900">
            {config.title}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-500">
            {config.description}
          </DialogDescription>
        </DialogHeader>

        <div className={GUIDE_DIALOG_BODY_CLASS}>
          {config.items.map((item, index) => {
            const Icon = item.icon;
            return (
              <section
                key={item.title}
                className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm ring-1 ring-slate-900/[0.02]"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-strong ring-1 ring-primary-muted/50">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <h3 className="flex items-baseline gap-2 text-[15px] font-semibold tracking-tight text-slate-900">
                      <span className="tabular-nums text-primary-strong">
                        {index + 1}.
                      </span>
                      {item.title}
                    </h3>
                    <ul className="space-y-1.5">
                      {item.points.map((rawPoint, pointIndex) => {
                        const point = normalizePlatformBenefitPoint(rawPoint);
                        return (
                          <li
                            key={`${item.title}-${pointIndex}`}
                            className="flex gap-2 text-sm leading-relaxed text-slate-600"
                          >
                            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary-muted" />
                            <span className="min-w-0">
                              {point.text}
                              {point.link ? (
                                <>
                                  {" "}
                                  <Link
                                    to={point.link.to}
                                    className="font-medium text-primary-strong underline underline-offset-2 hover:opacity-90"
                                    onClick={() => onOpenChange(false)}
                                  >
                                    {point.link.label}
                                  </Link>
                                </>
                              ) : null}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </section>
            );
          })}

          <p className="flex items-start gap-2 rounded-2xl border border-dashed border-primary-muted/60 bg-primary-soft/40 px-4 py-3 text-sm leading-relaxed text-slate-700">
            <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" />
            <span>{config.footerNote}</span>
          </p>

          <PlatformBenefitsShareButtons viewerKind={variant} />
        </div>
      </DialogContent>
    </Dialog>
  );
};
