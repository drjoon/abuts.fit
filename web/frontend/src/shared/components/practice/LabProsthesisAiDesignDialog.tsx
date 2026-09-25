// 기공소 채팅 헤더 — 작업시작 오른쪽 AI. 확정된 스캔 역할과 주문 치아를 보여 준다.
import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/shared/ui/cn";
import {
  buildLabProsthesisAiPlan,
  formatProsthesisAiToothLabel,
  oralScanRoleLabel,
  type LabProsthesisAiPlan,
} from "@/shared/practice/labProsthesisAiDesign";

type LabProsthesisAiDesignButtonProps = {
  toothWorks?: ReadonlyArray<{
    toothNumber?: string | null;
    prosthesisType?: string | null;
    bridgeLinkedTeeth?: readonly string[] | null;
  }> | null;
  files?: ReadonlyArray<{
    fileName?: string | null;
    scanRole?: string | null;
  }> | null;
  className?: string;
};

type ReadPhase = "reading" | "ready";

export function LabProsthesisAiDesignButton({
  toothWorks,
  files,
  className,
}: LabProsthesisAiDesignButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("h-9 gap-1 px-3", className)}
        title="업로드 스캔으로 보철 디자인"
        aria-label="AI 보철 디자인"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        <span>AI</span>
      </Button>
      <LabProsthesisAiDesignDialog
        open={open}
        onOpenChange={setOpen}
        toothWorks={toothWorks}
        files={files}
      />
    </>
  );
}

function LabProsthesisAiDesignDialog({
  open,
  onOpenChange,
  toothWorks,
  files,
}: LabProsthesisAiDesignButtonProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const plan = useMemo(
    () => buildLabProsthesisAiPlan({ toothWorks, files }),
    [files, toothWorks],
  );
  const [phase, setPhase] = useState<ReadPhase>("reading");

  useEffect(() => {
    if (!open) {
      setPhase("reading");
      return;
    }
    const timer = window.setTimeout(() => setPhase("ready"), 450);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[370] gap-0 overflow-hidden p-0 sm:max-w-md"
        overlayClassName="z-[365]"
      >
        <DialogHeader className="space-y-1 border-b bg-slate-50 px-5 py-4 text-left">
          <DialogTitle className="text-base">AI 보철 디자인</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
            치과가 확정한 상악·하악·바이트를 읽고,
            <br />
            바이트 기준으로 스캔을 겹친 뒤 주문 치아의 보철을 디자인합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[min(60vh,28rem)] space-y-4 overflow-y-auto px-5 py-4">
          <section className="space-y-2">
            <p className="text-xs font-semibold text-foreground">주문 치아</p>
            {plan.teeth.length === 0 ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                주문에 치아번호가 없습니다.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {plan.teeth.map((tooth, index) => (
                  <li
                    key={`${tooth.toothNumber}-${tooth.prosthesisType}-${index}`}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-medium",
                      tooth.designable
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {formatProsthesisAiToothLabel(tooth)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <p className="text-xs font-semibold text-foreground">업로드 파일</p>
            {plan.scans.length === 0 ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                업로드된 파일이 없습니다.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {plan.scans.map((scan, index) => (
                  <li
                    key={`${scan.fileName}-${index}`}
                    className="flex min-w-0 items-center gap-2 text-xs"
                  >
                    <span
                      className={cn(
                        "w-12 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-semibold",
                        scan.role === "other"
                          ? "bg-muted text-muted-foreground"
                          : "bg-primary/10 text-primary",
                      )}
                    >
                      {oralScanRoleLabel(scan.role)}
                    </span>
                    <span className="min-w-0 truncate text-foreground">
                      {scan.fileName}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-md border bg-slate-50 px-3 py-3 text-xs leading-relaxed text-foreground">
            {phase === "reading" ? (
              <p>업로드 파일을 읽는 중…</p>
            ) : (
              <PlanStatus plan={plan} />
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlanStatus({ plan }: { plan: LabProsthesisAiPlan }) {
  if (plan.designableTeeth.length === 0) {
    return (
      <p>
        디자인할 크라운·인레이·온레이·브리지 주문이 없습니다.
        <br />
        주문 치아와 보철 형태를 확인해 주세요.
      </p>
    );
  }
  if (plan.missingRoles.length > 0) {
    const missing = plan.missingRoles.map(oralScanRoleLabel).join("·");
    return (
      <p>
        {missing} 스캔이 없습니다.
        <br />
        상악·하악·바이트가 있어야 교합을 맞추고 보철을 디자인합니다.
      </p>
    );
  }
  const targets = plan.designableTeeth
    .map((tooth) => formatProsthesisAiToothLabel(tooth))
    .join(", ");
  return (
    <p>
      스캔 역할을 확인했습니다. {targets}
      <br />
      바이트를 기준으로 상악·하악을 겹치고, 보철이 스캔과 만나는 선을 마진으로 저장합니다.
      <br />
      보철 파일을 올리면 작업이 완료됩니다.
      <br />
      스캔·치아·형태·마진이 학습 데이터로 남습니다.
    </p>
  );
}
