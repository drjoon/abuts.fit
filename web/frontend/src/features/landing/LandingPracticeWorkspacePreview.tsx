// related files:
// - web/frontend/src/features/landing/LandingBrandStory.tsx
// - web/frontend/src/features/landing/LandingAboutSection.tsx
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersCalendar.tsx
import { CalendarDays, MessageSquare } from "lucide-react";
import { cn } from "@/shared/ui/cn";

const WEEKDAYS = ["월", "화", "수", "목", "금"] as const;

const CHIPS: Array<{
  day: number;
  label: string;
  status: string;
  tone: string;
}> = [
  {
    day: 0,
    label: "김··· · 어벗",
    status: "작업시작",
    tone: "bg-sky-100 text-sky-800 ring-sky-200",
  },
  {
    day: 1,
    label: "이··· · 임시",
    status: "디자인",
    tone: "bg-violet-100 text-violet-800 ring-violet-200",
  },
  {
    day: 2,
    label: "박··· · 어벗",
    status: "출고",
    tone: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  },
  {
    day: 3,
    label: "최··· · 지르",
    status: "의뢰",
    tone: "bg-amber-100 text-amber-900 ring-amber-200",
  },
  {
    day: 4,
    label: "정··· · 어벗",
    status: "작업시작",
    tone: "bg-sky-100 text-sky-800 ring-sky-200",
  },
];

const MESSAGES = [
  {
    side: "lab" as const,
    text: "디자인 확인 부탁드립니다. 교합면 높이 0.3 조정했습니다.",
  },
  {
    side: "practice" as const,
    text: "네, 확인했습니다. 이대로 제작 진행해 주세요.",
  },
  {
    side: "lab" as const,
    text: "출고 예정일이 목요일로 잡혔습니다.",
  },
];

/** 랜딩용 — 치과 의뢰 캘린더 ↔ 채팅 분할 UI 프리뷰 (장식, 비인터랙티브) */
export function LandingPracticeWorkspacePreview({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex h-full min-h-[200px] w-full flex-col overflow-hidden rounded-[15px] bg-[#f4f6f9] text-left sm:min-h-[240px]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-slate-200/80 bg-white px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded bg-slate-900 px-2 py-1 text-[10px] font-medium text-white">
            <CalendarDays className="h-3 w-3" />
            캘린더
          </span>
          <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-slate-500">
            목록
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
          <MessageSquare className="h-3 w-3" />
          기공소 채팅
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[1.15fr_0.95fr]">
        {/* Calendar */}
        <div className="min-w-0 border-r border-slate-200/80 bg-white p-2 sm:p-2.5">
          <div className="mb-1.5 flex items-center justify-between px-0.5">
            <p className="text-[10px] font-semibold text-slate-700">9월 3주차</p>
            <p className="text-[9px] text-slate-400">도착일 기준</p>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {WEEKDAYS.map((label, day) => {
              const chip = CHIPS.find((c) => c.day === day);
              return (
                <div
                  key={label}
                  className="min-h-[5.5rem] rounded-md border border-slate-100 bg-slate-50/80 p-1 sm:min-h-[6.5rem]"
                >
                  <div className="mb-1 flex items-center justify-between px-0.5">
                    <span className="text-[9px] font-medium text-slate-500">
                      {label}
                    </span>
                    <span className="text-[9px] tabular-nums text-slate-400">
                      {15 + day}
                    </span>
                  </div>
                  {chip ? (
                    <div
                      className={cn(
                        "rounded px-1 py-1 text-[8px] leading-tight ring-1 ring-inset sm:text-[9px]",
                        chip.tone,
                      )}
                    >
                      <p className="truncate font-semibold">{chip.status}</p>
                      <p className="mt-0.5 truncate opacity-80">{chip.label}</p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Chat */}
        <div className="flex min-w-0 flex-col bg-[#f8fafc]">
          <div className="border-b border-slate-200/70 bg-white px-2.5 py-1.5">
            <p className="truncate text-[10px] font-semibold text-slate-700">
              어벗츠기공소 · 김··· 어벗
            </p>
            <p className="text-[9px] text-slate-400">작업시작 · 채팅 연동</p>
          </div>
          <div className="flex flex-1 flex-col gap-1.5 overflow-hidden px-2 py-2">
            {MESSAGES.map((msg) => (
              <div
                key={msg.text}
                className={cn(
                  "max-w-[92%] rounded-lg px-2 py-1.5 text-[9px] leading-snug sm:text-[10px]",
                  msg.side === "practice"
                    ? "ml-auto bg-sky-600 text-white"
                    : "bg-white text-slate-700 ring-1 ring-slate-200/80",
                )}
              >
                {msg.text}
              </div>
            ))}
          </div>
          <div className="border-t border-slate-200/70 bg-white px-2 py-1.5">
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-2 py-1.5 text-[9px] text-slate-400">
              메시지 입력…
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
