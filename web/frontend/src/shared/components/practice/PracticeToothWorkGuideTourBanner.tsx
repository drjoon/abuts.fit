// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// change-log:
// - 2026-08-25: aside — 헤더 버튼~입력 행을 세로로 채우도록 h-full·space-between.
// - 2026-08-25: 어벗 투어 — 스캔바디 커스텀어벗 vs 심플어벗(꽂고 바로 스캔) 두 방식 안내.
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";

/** 기공의뢰 작성 전체 체험형 가이드투어 (기공소·환자·날짜 → 보철물) */
export const PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS = [
  {
    id: "lab",
    title: "기공소 선택",
    hint: "검색창에 기공소를 입력하세요.",
  },
  {
    id: "patient",
    title: "환자명",
    hint: "완성형 한글 환자명을 입력하세요.",
  },
  {
    id: "dates",
    title: "날짜 확인",
    hint: "주문·치과도착일 버튼을 눌러 날짜를 확인하세요.",
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
    hint: "임플란트를 고른 뒤, 오른쪽에서 어벗 방식을 이어 선택합니다.",
  },
  {
    id: "abutment_side",
    title: "어벗 방식",
    hint: "스캔바디(커스텀어벗) 또는 심플어벗·심플밀링 중 하나를 고르세요. 둘은 함께 쓸 수 없습니다.",
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

/**
 * 가이드투어 스텝 → 익스프레스 위저드 단계.
 * lab/patient/dates 이후 보철·견적 투어는 prosthesis에 고정(파일·확인으로 새지 않음).
 */
export const getExpressStepIdForGuideTourStep = (
  step: PracticeToothWorkGuideTourStep | null,
): "lab" | "patient" | "schedule" | "prosthesis" | null => {
  if (step == null) return null;
  if (step >= PRACTICE_TOOTH_WORK_GUIDE_TOUR_DONE_STEP) return "prosthesis";
  const id = getPracticeToothWorkGuideTourStepId(step);
  if (id === "lab") return "lab";
  if (id === "patient") return "patient";
  if (id === "dates") return "schedule";
  if (id != null) return "prosthesis";
  return null;
};

/** 익스프레스 단계 클릭 시 투어 스텝을 맞춤. 파일·확인은 투어를 완료로 점프시키지 않음. */
export const getGuideTourStepForExpressStepId = (
  expressStepId: "lab" | "patient" | "schedule" | "prosthesis" | "files" | "confirm",
  currentTourStep: PracticeToothWorkGuideTourStep | null,
): PracticeToothWorkGuideTourStep | null => {
  if (currentTourStep == null) return null;
  if (expressStepId === "lab") return 0;
  if (expressStepId === "patient") return 1;
  if (expressStepId === "schedule") return 2;
  if (expressStepId === "prosthesis") {
    if (currentTourStep >= PRACTICE_TOOTH_WORK_GUIDE_TOUR_DONE_STEP) {
      return 3;
    }
    return currentTourStep >= 3 ? currentTourStep : 3;
  }
  // 파일·확인: 투어 스텝 유지(이미 완료면 완료 유지). 완료로 강제 점프하지 않음.
  return currentTourStep;
};

type PracticeToothWorkGuideTourBannerProps = {
  step: PracticeToothWorkGuideTourStep;
  onSkip: () => void;
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

const resolveTourCopy = (
  step: PracticeToothWorkGuideTourStep,
  implantFavoriteCount: number,
  scanbodyFavoriteCount: number,
) => {
  const base =
    PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS[step] ?? PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS[0];
  if (base.id === "implant_preset" && implantFavoriteCount <= 0) {
    return {
      ...base,
      hint: "아래에서 제조사·브랜드·패밀리·타입을 고른 뒤 저장하세요. 다음은 어벗 방식입니다.",
    };
  }
  if (base.id === "abutment_side" && scanbodyFavoriteCount <= 0) {
    return {
      ...base,
      hint: "스캔바디가 없으면 추가하거나, 오른쪽에서 심플어벗·심플밀링(직경·높이)을 고르세요.",
    };
  }
  return base;
};

/** 기공의뢰 작성 전체 체험형 가이드투어 안내 바 */
export function PracticeToothWorkGuideTourBanner({
  step,
  onSkip,
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
    : resolveTourCopy(step, implantFavoriteCount, scanbodyFavoriteCount);
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
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-slate-500 hover:bg-accent-soft hover:text-accent-strong"
                onClick={onSkip}
              >
                건너뛰기
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 border-accent-muted px-2 text-xs text-accent-strong hover:bg-accent-soft"
                onClick={onExit}
              >
                종료
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
