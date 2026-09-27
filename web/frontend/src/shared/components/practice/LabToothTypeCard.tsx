// 기공소 AI 보철 — 치아 번호·유형 카드. 작업 문서에만 남기고 의뢰 치식은 바꾸지 않는다.

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  LAB_TOOTH_KINDS,
  type LabToothKind,
} from "@/shared/practice/labProsthesisAiDesign";
import { cn } from "@/shared/ui/cn";

const UPPER = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const LOWER = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];

type Props = {
  toothNumber: string;
  kind: LabToothKind;
  /** 브리지 스팬 안에서만 폰틱을 고른다. */
  canPontic: boolean;
  /** 다른 주문 치아가 쓰는 번호. */
  takenNumbers: ReadonlySet<string>;
  onApply: (toothNumber: string, kind: LabToothKind) => void;
  onClose: () => void;
};

export function LabToothTypeCard({
  toothNumber,
  kind,
  canPontic,
  takenNumbers,
  onApply,
  onClose,
}: Props) {
  const [number, setNumber] = useState(toothNumber);
  const [nextKind, setNextKind] = useState<LabToothKind>(kind);

  useEffect(() => {
    setNumber(toothNumber);
    setNextKind(kind);
  }, [kind, toothNumber]);

  const changed = number !== toothNumber || nextKind !== kind;
  const row = (numbers: readonly string[]) => (
    <div className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
      {numbers.map((value, index) => {
        const taken = takenNumbers.has(value);
        return (
          <button
            key={value}
            type="button"
            disabled={taken}
            className={cn(
              "h-6 rounded text-[10px] font-medium tabular-nums",
              index === 8 && "ml-1",
              value === number
                ? "bg-primary text-primary-foreground"
                : taken
                  ? "bg-muted text-muted-foreground/60"
                  : "border hover:bg-muted",
            )}
            onClick={() => setNumber(value)}
          >
            {value}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="w-[26rem] max-w-[calc(100vw-2rem)] rounded-lg border bg-background/95 p-3 text-sm shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-semibold text-foreground">치아 번호·유형</p>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          aria-label="닫기"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-1">
        {row(UPPER)}
        {row(LOWER)}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-foreground">
          {number}
          {nextKind === "implant" ? "i" : ""}
        </span>
        <span className="text-xs text-muted-foreground">
          {LAB_TOOTH_KINDS.find((item) => item.id === nextKind)?.label}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1">
        {LAB_TOOTH_KINDS.map((item) => (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant={nextKind === item.id ? "default" : "outline"}
            className="h-7 px-1 text-[11px]"
            disabled={item.id === "pontic" && !canPontic}
            title={item.id === "pontic" && !canPontic ? "브리지 스팬에서만 폰틱을 고릅니다." : undefined}
            onClick={() => setNextKind(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        이 작업에만 적용하고 의뢰 치식은 그대로 둡니다.
        <br />
        유형을 바꾸면 그 치아의 마진과 생성 결과를 다시 잡습니다.
      </p>
      <Button
        type="button"
        size="sm"
        className="mt-2 h-7 w-full text-[11px]"
        disabled={!changed}
        onClick={() => onApply(number, nextKind)}
      >
        적용
      </Button>
    </div>
  );
}
