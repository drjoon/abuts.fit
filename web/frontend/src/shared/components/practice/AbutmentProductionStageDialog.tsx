// 기공의뢰 채팅의 「어벗츠생산」 줄을 누르면 여는 공정 도표.
// related files:
// - web/frontend/src/shared/components/practice/LabPendingAbutmentGuide.tsx
import { ChevronDown, ChevronRight } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/shared/ui/cn";

export const ABUTMENT_PRODUCTION_STAGES = [
  { id: "대기", title: "대기", body: "기공소의 어벗 디자인 STL 업로드 대기" },
  { id: "준비", title: "준비", body: "제조사에서 의뢰 내용을 검토하고 가공 준비" },
  { id: "가공", title: "가공", body: "의뢰 내용대로 커스텀어벗 절삭 가공" },
  { id: "세척.패킹", title: "세척.패킹", body: "세척하고 라벨 붙은 포장지에 개별 패킹" },
  { id: "포장.발송", title: "포장.발송", body: "출고할 제품들을 한 박스에 담아 발송" },
] as const;

export type AbutmentProductionStageId = (typeof ABUTMENT_PRODUCTION_STAGES)[number]["id"];

/** 채팅에 보이는 공정 문구를 도표의 다섯 단계로 묶는다. */
export function abutmentProductionStageId(label: string): AbutmentProductionStageId {
  if (label === "대기") return "대기";
  if (label === "가공" || label === "CAM") return "가공";
  if (label === "세척.패킹") return "세척.패킹";
  if (label === "포장.발송" || label === "추적관리" || label === "배송대기" || label === "배송중") {
    return "포장.발송";
  }
  return "준비";
}

export function AbutmentProductionStageDialog({
  open,
  onOpenChange,
  teethByStage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teethByStage: ReadonlyMap<AbutmentProductionStageId, readonly string[]>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[430] sm:max-w-4xl"
        overlayClassName="z-[420]"
      >
        <DialogHeader>
          <DialogTitle>어벗츠생산 공정</DialogTitle>
          <DialogDescription>
            치아가 지금 머무는 단계를 표시합니다.
          </DialogDescription>
        </DialogHeader>
        <ol className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-1">
          {ABUTMENT_PRODUCTION_STAGES.map((stage, index) => {
            const teeth = teethByStage.get(stage.id) ?? [];
            const current = teeth.length > 0;
            return (
              <li key={stage.id} className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-1">
                <div
                  className={cn(
                    "flex min-w-0 flex-1 flex-col rounded-xl border p-3",
                    current
                      ? "border-primary bg-primary-soft"
                      : "border-border bg-muted/40",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                        current
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {index + 1}
                    </span>
                    <span className="font-semibold text-foreground">{stage.title}</span>
                    {current ? (
                      <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[0.625rem] font-semibold text-primary-foreground">
                        현재
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{stage.body}</p>
                  {current ? (
                    <p className="mt-2 text-xs font-semibold text-foreground">{teeth.join(", ")}</p>
                  ) : null}
                </div>
                {index < ABUTMENT_PRODUCTION_STAGES.length - 1 ? (
                  <div className="flex shrink-0 items-center justify-center text-muted-foreground" aria-hidden>
                    <ChevronDown className="h-4 w-4 sm:hidden" />
                    <ChevronRight className="hidden h-4 w-4 sm:block" />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
