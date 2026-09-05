// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/guideTour/GuideTourProvider.tsx
// change-log:
// - 2026-09-05: 임플란트·어벗 프리셋 미설정 시 「+ 추가」저장 안내. resolve 함수 export(플랫폼 Spotlight).
// - 2026-09-05: 건너뛰기 제거. 종료 → 일시 중단(플랫폼 투어).
// - 2026-08-25: aside — 헤더 버튼~입력 행을 세로로 채우도록 h-full·space-between.
// - 2026-08-25: 어벗 투어 — 스캔바디 커스텀어벗 vs 심플어벗(꽂고 바로 스캔) 두 방식 안내.
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";

/** 기공의뢰 작성 전체 체험형 가이드투어 (기공소·환자·날짜 → 보철물) */
export const PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS = [
  {
    id: "lab",
    title: "기공소 선택",
    hint: "기공소를 입력 혹은 선택하세요.",
  },
  {
    id: "patient",
    title: "환자명",
    hint: "완성형 한글 환자명을 입력하세요.",
  },
  {
    id: "dates",
    title: "날짜 확인",
    hint: "주문·도착일 버튼을 눌러 날짜를 확인하세요.",
  },
  {
    id: "select",
    title: "치아 선택",
    hint: "빈 칸을 클릭하거나 드래그해 보철물을 선택하세요.",
  },
  {
    id: "deselect",
    title: "치아 해제",
    hint: "선택된 치아 칸을 다시 클릭하면 해제됩니다.",
  },
  {
    id: "bridge",
    title: "브리지 연결",
    hint: "치아 사이 + 를 눌러 브리지를 연결하세요.",
  },
  {
    id: "type",
    title: "형태 변경",
    hint: "형태 글자(크라운 등)를 클릭해 종류를 바꾸세요.",
  },
  {
    id: "copy",
    title: "복사",
    hint: "「복사」를 다른 치아로 드래그해 형태·어벗을 복사하세요.",
  },
  {
    id: "abutment",
    title: "어벗 선택",
    hint: "「어벗」을 켜세요. 스캔바디 커스텀어벗과 심플어벗(꽂고 바로 스캔) 두 방식이 있습니다.",
  },
  {
    id: "implant_preset",
    title: "임플란트",
    hint: "임플란트 프리셋을 고르세요. 없으면 「+ 추가」로 제조사·브랜드·패밀리·타입을 저장한 뒤 선택합니다.",
  },
  {
    id: "abutment_side",
    title: "어벗 방식",
    hint: "스캔바디 또는 심플어벗·심플밀링을 고르세요. 스캔바디가 없으면 「+ 추가」하거나 오른쪽 심플 규격을 선택합니다.",
  },
  {
    id: "estimate",
    title: "견적 확인",
    hint: "아래 깜빡이는 견적에 마우스를 올려 툴팁으로 기공비를 확인하세요. 심플어벗은 어벗 기공비가 없습니다.",
  },
] as const;

export type PracticeToothWorkGuideTourStepId =
  (typeof PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS)[number]["id"];

/** 0..N-1 = 체험 스텝, N = 완료 */
export type PracticeToothWorkGuideTourStep = number;

export const PRACTICE_TOOTH_WORK_GUIDE_TOUR_DONE_STEP =
  PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS.length;

export const getPracticeToothWorkGuideTourStepId = (
  step: PracticeToothWorkGuideTourStep | null,
): PracticeToothWorkGuideTourStepId | null => {
  if (step == null || step < 0 || step >= PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS.length) {
    return null;
  }
  return PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS[step]?.id ?? null;
};

type PracticeToothWorkGuideTourBannerProps = {
  step: PracticeToothWorkGuideTourStep;
  onExit: () => void;
  onFinish: () => void;
  className?: string;
  /** center: 치식 위 중앙 / aside: 헤더 버튼~기공소·환자·날짜 행 오른쪽 세로 맞춤 */
  placement?: "center" | "aside";
  /** 임플란트 프리셋 개수 — 0이면 추가 유도 문구 */
  implantFavoriteCount?: number;
  /** 스캔바디 프리셋 개수 — 0이면 스캔바디 추가·심플 선택 유도 */
  scanbodyFavoriteCount?: number;
};

/** 플랫폼 Spotlight·로컬 배너 공통 — 프리셋 0개면 추가 저장 절차를 자세히 안내 */
export const resolvePracticeToothWorkGuideTourCopy = (
  step: PracticeToothWorkGuideTourStep,
  implantFavoriteCount: number,
  scanbodyFavoriteCount: number,
) => {
  const base =
    PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS[step] ?? PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS[0];
  if (base.id === "implant_preset" && implantFavoriteCount <= 0) {
    return {
      ...base,
      title: "임플란트 프리셋 설정",
      hint: "처음에는 프리셋이 없습니다. 왼쪽 「+ 추가」에서 제조사·브랜드·패밀리·타입을 고른 뒤 「저장」하세요. 저장한 카드를 클릭하면 선택됩니다.",
    };
  }
  if (base.id === "abutment_side" && scanbodyFavoriteCount <= 0) {
    return {
      ...base,
      title: "어벗 프리셋 설정",
      hint: "스캔바디 프리셋이 없으면 가운데 「+ 추가」로 제조사·직경·높이를 저장하세요. 또는 오른쪽에서 심플어벗/심플밀링과 직경·높이를 고릅니다. 스캔바디와 심플은 함께 쓸 수 없습니다.",
    };
  }
  if (base.id === "implant_preset") {
    return {
      ...base,
      hint: "왼쪽에서 임플란트 프리셋을 클릭해 고르세요. 새 스펙은 「+ 추가」로 저장할 수 있습니다.",
    };
  }
  if (base.id === "abutment_side") {
    return {
      ...base,
      hint: "가운데 스캔바디를 고르거나, 오른쪽 심플어벗·심플밀링(직경·높이)을 선택하세요. 둘은 함께 쓸 수 없습니다.",
    };
  }
  return base;
};

/** 기공의뢰 작성 체험형 가이드투어 안내 바 (로컬·비플랫폼 폴백) */
export function PracticeToothWorkGuideTourBanner({
  step,
  onExit,
  onFinish,
  className,
  placement = "center",
  implantFavoriteCount = 0,
  scanbodyFavoriteCount = 0,
}: PracticeToothWorkGuideTourBannerProps) {
  const isDone = step >= PRACTICE_TOOTH_WORK_GUIDE_TOUR_DONE_STEP;
  const current = isDone
    ? {
        title: "완료",
        hint: "투어를 마쳤습니다. 기공소·환자·날짜·보철물을 이어서 작성해 주세요.",
      }
      : resolvePracticeToothWorkGuideTourCopy(
          step,
          implantFavoriteCount,
          scanbodyFavoriteCount,
        );
  const total = PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS.length;
  const aside = placement === "aside";

  return (
    <div
      className={cn(
        aside ? "flex w-full min-w-0" : "flex justify-center px-1",
        className,
      )}
    >
      <div
        role="status"
        className={cn(
          "relative z-20 rounded-lg border border-accent-muted bg-accent-soft px-3 py-2 shadow-sm shadow-accent/15",
          aside
            ? "flex w-full max-w-sm flex-col gap-2 lg:max-w-[22rem]"
            : "inline-flex max-w-full items-center gap-3 overflow-x-auto",
        )}
      >
        <div
          className={cn(
            "min-w-0",
            aside
              ? "space-y-0.5"
              : "flex items-baseline gap-2 whitespace-nowrap",
          )}
        >
          <p className="text-xs font-semibold text-accent-strong">
            {isDone ? current.title : `${current.title} · ${step + 1}/${total}`}
          </p>
          <p
            className={cn(
              "text-xs text-slate-600",
              aside ? "leading-snug" : undefined,
            )}
          >
            {current.hint}
          </p>
        </div>
        <div className={cn("flex shrink-0 items-center gap-1.5", aside && "self-end")}>
          {isDone ? (
            <Button
              type="button"
              size="sm"
              className="h-7 bg-accent px-2.5 text-xs text-accent-foreground hover:bg-accent-strong"
              onClick={onFinish}
            >
              확인
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 border-accent-muted px-2 text-xs text-accent-strong hover:bg-accent-soft"
              onClick={onExit}
            >
              일시 중단
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
