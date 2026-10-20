import { Gift, Sparkles } from "lucide-react";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import {
  parseNewImplantAckDisplayLine,
} from "@/shared/practice/newImplantCaseInfos";
import {
  NEW_IMPLANT_DEVELOPMENT_ACK_BENEFIT,
  NEW_IMPLANT_DEVELOPMENT_ACK_CNC,
  NEW_IMPLANT_DEVELOPMENT_ACK_CREDIT,
  NEW_IMPLANT_DEVELOPMENT_ACK_FOLLOWUP,
  NEW_IMPLANT_DEVELOPMENT_ACK_TITLE,
} from "@/shared/practice/newImplantQuickPresets";
import { cn } from "@/shared/ui/cn";

type Props = {
  open: boolean;
  lines: string[];
  onConfirm: () => void;
};

export function NewImplantDevelopmentAckDialog({
  open,
  lines,
  onConfirm,
}: Props) {
  const visible = open && lines.length > 0;
  const parsed = lines.map(parseNewImplantAckDisplayLine);

  return (
    <ConfirmDialog
      open={visible}
      panelClassName="max-w-lg"
      title={
        <span className="flex items-start gap-3">
          <span
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-strong ring-1 ring-primary-muted/70"
            aria-hidden
          >
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="min-w-0 space-y-1">
            <span className="block text-lg font-semibold tracking-tight text-slate-900">
              {NEW_IMPLANT_DEVELOPMENT_ACK_TITLE}
            </span>
            {lines.length > 1 ? (
              <span className="block text-xs font-medium text-slate-500">
                {lines.length}건 접수
              </span>
            ) : null}
          </span>
        </span>
      }
      confirmLabel="확인"
      confirmTone="primary"
      showCancel={false}
      showCloseButton={false}
      closeOnBackdrop={false}
      onConfirm={onConfirm}
      onCancel={() => {}}
      description={
        <div className="-mt-1 space-y-3.5">
          <ul className="max-h-40 space-y-2 overflow-y-auto px-0.5 py-0.5">
            {parsed.map((row, index) => (
              <li
                key={`${row.raw}-${index}`}
                className="rounded-xl border border-slate-200/90 bg-gradient-to-br from-white to-slate-50/90 px-3.5 py-2.5 shadow-sm"
              >
                {row.patient || row.tooth ? (
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    {row.patient ? (
                      <span className="font-semibold text-slate-900">
                        {row.patient}
                      </span>
                    ) : null}
                    {row.tooth ? (
                      <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary-strong">
                        {row.tooth}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <p
                  className={cn(
                    "text-sm leading-snug text-slate-600",
                    (row.patient || row.tooth) && "mt-1",
                  )}
                >
                  {row.spec || row.raw}
                </p>
              </li>
            ))}
          </ul>

          <p className="rounded-xl border border-amber-200/90 bg-amber-50/95 px-3.5 py-2.5 text-sm leading-snug text-amber-950">
            {NEW_IMPLANT_DEVELOPMENT_ACK_CNC.split("CNC 생산")[0]}
            <span className="font-semibold text-amber-900">CNC 생산</span>
            {NEW_IMPLANT_DEVELOPMENT_ACK_CNC.split("CNC 생산")[1]}
          </p>

          <div className="rounded-xl border border-primary/25 bg-primary-soft/45 px-3.5 py-3 text-sm leading-relaxed text-slate-800">
            <div className="flex gap-2.5">
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/80 text-primary-strong ring-1 ring-primary/20"
                aria-hidden
              >
                <Gift className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="leading-snug">
                  {NEW_IMPLANT_DEVELOPMENT_ACK_BENEFIT.split(
                    NEW_IMPLANT_DEVELOPMENT_ACK_CREDIT,
                  )[0]}
                  <span className="font-bold text-primary-strong">
                    {NEW_IMPLANT_DEVELOPMENT_ACK_CREDIT}
                  </span>
                  {
                    NEW_IMPLANT_DEVELOPMENT_ACK_BENEFIT.split(
                      NEW_IMPLANT_DEVELOPMENT_ACK_CREDIT,
                    )[1]
                  }
                  <br />
                  <span className="text-slate-600">
                    {NEW_IMPLANT_DEVELOPMENT_ACK_FOLLOWUP}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      }
    />
  );
}
