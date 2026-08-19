// related files:
// - web/frontend/src/shared/platform/platformBenefitsContent.ts
// - web/frontend/src/features/platform/PlatformBenefitsShareButtons.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorPolicyRemakeHeader.tsx
// - web/frontend/src/features/lab/LabPlatformBenefitsBanner.tsx
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle className="text-xl tracking-tight">
            {config.title}
          </DialogTitle>
          <DialogDescription className="text-[15px] leading-relaxed text-slate-600">
            {config.description}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-1 space-y-3">
          {config.items.map((item, index) => {
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
                      {item.points.map((rawPoint, pointIndex) => {
                        const point = normalizePlatformBenefitPoint(rawPoint);
                        return (
                          <li
                            key={`${item.title}-${pointIndex}`}
                            className="flex gap-2 text-sm leading-relaxed text-slate-600"
                          >
                            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-sky-400" />
                            <span className="min-w-0">
                              {point.text}
                              {point.link ? (
                                <>
                                  {" "}
                                  <Link
                                    to={point.link.to}
                                    className="font-medium text-sky-700 underline underline-offset-2 hover:text-sky-800"
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

          <p className="flex items-start gap-2 rounded-xl border border-dashed border-sky-200 bg-sky-50/60 px-4 py-3 text-sm leading-relaxed text-slate-700">
            <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
            <span>{config.footerNote}</span>
          </p>

          <PlatformBenefitsShareButtons viewerKind={variant} />
        </div>
      </DialogContent>
    </Dialog>
  );
};
