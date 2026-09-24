// related files:
// - web/frontend/src/shared/practice/practiceTransferBookmarks.ts
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - 2026-09-24: 5건 이상이면 드롭다운 선택(10행 표시·초과 스크롤), 미만은 순회.
import { Bookmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PRACTICE_TRANSFER_BOOKMARK_DROPDOWN_MIN_COUNT,
  PRACTICE_TRANSFER_BOOKMARK_DROPDOWN_VISIBLE_COUNT,
} from "@/shared/practice/practiceTransferBookmarks";
import { cn } from "@/shared/ui/cn";

export type PracticeTransferBookmarkNavigateOption = {
  transferId: string;
  label: string;
};

type PracticeTransferBookmarkNavigateButtonProps = {
  count: number;
  options: PracticeTransferBookmarkNavigateOption[];
  onCycle: () => void;
  onSelect: (transferId: string) => void;
  /** 드롭다운 열릴 때 캐시 hydrate 등 */
  onOpenChange?: (open: boolean) => void;
  buttonClassName?: string;
  iconClassName?: string;
  showLabel?: boolean;
  labelClassName?: string;
  withTooltip?: boolean;
};

const CYCLE_HINT =
  "북마크한 의뢰(전기간). 클릭하면 하나씩 열어 순회합니다.";
const PICK_HINT =
  "북마크한 의뢰(전기간). 목록에서 골라 엽니다.";

/** 행 높이 ≈ h-9(2.25rem) — 10행 + 메뉴 padding */
const DROPDOWN_MAX_H = `calc(2.25rem * ${PRACTICE_TRANSFER_BOOKMARK_DROPDOWN_VISIBLE_COUNT} + 0.5rem)`;

export function PracticeTransferBookmarkNavigateButton({
  count,
  options,
  onCycle,
  onSelect,
  onOpenChange,
  buttonClassName,
  iconClassName,
  showLabel = false,
  labelClassName,
  withTooltip = true,
}: PracticeTransferBookmarkNavigateButtonProps) {
  const aria = count > 0 ? `북마크 ${count}건` : "북마크";
  const useDropdown = count >= PRACTICE_TRANSFER_BOOKMARK_DROPDOWN_MIN_COUNT;
  const hint = useDropdown ? PICK_HINT : CYCLE_HINT;

  const buttonInner = (
    <>
      <Bookmark
        className={cn(
          "h-4 w-4 shrink-0",
          count > 0 && "fill-sky-600 text-sky-700",
          iconClassName,
        )}
      />
      {showLabel ? (
        <span className={cn(labelClassName)}>북마크</span>
      ) : null}
      {count > 0 ? (
        <Badge
          variant="outline"
          className="h-4 min-w-4 justify-center rounded-full border-sky-200 bg-sky-100 px-1 text-[10px] leading-none text-sky-800"
        >
          {count}
        </Badge>
      ) : null}
    </>
  );

  if (useDropdown) {
    const trigger = (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={buttonClassName}
        aria-label={aria}
        title={hint}
        disabled={count === 0}
      >
        {buttonInner}
      </Button>
    );
    return (
      <DropdownMenu
        onOpenChange={(open) => {
          onOpenChange?.(open);
        }}
      >
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-[12rem] max-w-[min(20rem,90vw)] p-0"
        >
          <div className="overflow-y-auto p-1" style={{ maxHeight: DROPDOWN_MAX_H }}>
            {options.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                목록을 불러오는 중…
              </div>
            ) : (
              options.map((row) => {
                const id = String(row.transferId || "").trim();
                if (!id) return null;
                return (
                  <DropdownMenuItem
                    key={id}
                    className="h-9 cursor-pointer"
                    onSelect={() => onSelect(id)}
                  >
                    <span className="truncate">{row.label || id}</span>
                  </DropdownMenuItem>
                );
              })
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const button = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={buttonClassName}
      aria-label={aria}
      title={hint}
      disabled={count === 0}
      onClick={() => onCycle()}
    >
      {buttonInner}
    </Button>
  );

  if (!withTooltip) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}
