// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/guideTour/GuideTourProvider.tsx
// - web/frontend/src/shared/guideTour/guideTourSteps.ts
// change-log:
// - 2026-09-05: estimate 힌트 — 견적 금액 호버(툴팁) 안내.
// - 2026-09-05: custom_abut_scanbody·simple 삭제. 커스텀어벗 설정 1장(custom_abut)만.
// - 2026-09-05: prosthesis 제거·card_ops로 통합(직접 체험). 안내 문구 2줄.
// - 2026-09-05: custom_abut_implant 힌트 단축(임시 프리셋 체험만).
// - 2026-09-05: custom_abut → 임시 프리셋 3장 체험(임플란트·스캔바디·심플). 포커스 교차·「둘 중 하나」.
// - 2026-09-05: card_ops 힌트 — 조작 나열 → 직접 조작 안내.
// - 2026-09-05: prosthesis 힌트 — 프리필 나열 → 보철물 카드 선택 안내.
// - 2026-09-05: phone 힌트 — PC·모바일 동기화 안내.
// - 2026-09-05: phone을 memo_files 다음(4/15)으로 — 모바일 안내·폰 미리보기.
// - 2026-09-05: 구강 챕터 영화형 — 이전/다음만(card_ops만 체험). 세분 스텝·프리셋 카피 override 제거.
// - 2026-09-05: 임플란트·어벗 프리셋 미설정 시 「+ 추가」저장 안내. resolve 함수 export(플랫폼 Spotlight).
// - 2026-09-05: 건너뛰기 제거. 종료 → 일시 중단(플랫폼 투어).
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";

/** 기공의뢰 작성 가이드투어 — 구강 챕터 (플랫폼 oral_* 와 id 정렬) */
export const PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS = [
  {
    id: "header",
    title: "기공소 · 환자 · 날짜",
    hint: "기공소·환자명·도착일을 선택하거나 입력합니다.",
  },
  {
    id: "memo_files",
    title: "메모 · 파일",
    hint: "메모 입력과 구강 스캔 파일 업로드는 필요한 경우만 하세요.",
  },
  {
    id: "phone",
    title: "휴대폰 구강포토",
    hint: "모바일과 PC는 동기화되어 있어요.",
  },
  {
    id: "card_ops",
    title: "보철물",
    hint: "기공 의뢰 내용을 보철물 카드에서 간편하게 선택할 수 있습니다.\n직접 체험해보세요.",
  },
  {
    id: "custom_abut",
    title: "커스텀어벗 설정",
    hint: "임시 프리셋을 눌러 체험해보세요.",
  },
  {
    id: "estimate",
    title: "견적 확인",
    hint: "견적 금액에 마우스를 올려보세요.",
  },
  {
    id: "send",
    title: "기공소로 전송",
    hint: "작성이 끝나면 「기공소로 전송」으로 보냅니다. 투어에서는 누르지 말고 「다음」으로 이어 가세요.",
  },
  {
    id: "drafts",
    title: "임시저장 · 휴지통",
    hint: "임시저장은 전송 전 이어서 작성할 때, 휴지통은 취소·삭제한 의뢰를 볼 때 씁니다.",
  },
] as const;

export type PracticeToothWorkGuideTourStepId =
  (typeof PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS)[number]["id"];

/** 커스텀어벗 설정 체험(단일 스텝). 레거시 implant/scanbody/simple id도 인식 */
export const CUSTOM_ABUT_GUIDE_TOUR_STEP_IDS = ["custom_abut"] as const;

const CUSTOM_ABUT_GUIDE_TOUR_STEP_ALIASES = [
  "custom_abut",
  "custom_abut_implant",
  "custom_abut_scanbody",
  "custom_abut_simple",
] as const;

export type CustomAbutGuideTourStepId =
  (typeof CUSTOM_ABUT_GUIDE_TOUR_STEP_IDS)[number];

export const isCustomAbutGuideTourStepId = (
  stepId: string | null | undefined,
): stepId is CustomAbutGuideTourStepId =>
  Boolean(
    stepId &&
      (CUSTOM_ABUT_GUIDE_TOUR_STEP_ALIASES as readonly string[]).includes(
        stepId,
      ),
  );

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
};

/** 기공의뢰 작성 체험형 가이드투어 안내 바 (로컬·비플랫폼 폴백) */
export function PracticeToothWorkGuideTourBanner({
  step,
  onExit,
  onFinish,
  className,
  placement = "center",
}: PracticeToothWorkGuideTourBannerProps) {
  const isDone = step >= PRACTICE_TOOTH_WORK_GUIDE_TOUR_DONE_STEP;
  const current = isDone
    ? {
        title: "완료",
        hint: "투어를 마쳤습니다. 기공소·환자·날짜·보철물을 이어서 작성해 주세요.",
      }
    : PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS[step] ??
      PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS[0];
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
              "whitespace-pre-line text-xs text-slate-600",
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
