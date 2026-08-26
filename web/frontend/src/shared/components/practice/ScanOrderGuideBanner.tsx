// related files:
// - web/frontend/src/features/settings/tabs/ScanOrderGuideTab.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
import { Link } from "react-router-dom";
import { cn } from "@/shared/ui/cn";

type ScanOrderGuideBannerProps = {
  audience: "practice" | "lab";
  className?: string;
};

/**
 * 기공의뢰 발신/수신 화면 상단 한 줄 안내.
 */
export const ScanOrderGuideBanner = ({
  audience,
  className,
}: ScanOrderGuideBannerProps) => {
  const settingsHref =
    audience === "lab"
      ? "/dashboard/settings?tab=scan-order"
      : "/dashboard/settings?tab=scan-order";

  const text =
    audience === "lab"
      ? "TRIOS 스캔은 Communicate로 직접 받고, 기공의뢰서만 어벗츠에서 확인하세요. 비 3Shape은 STL/PLY 등 웹 업로드 그대로입니다."
      : "TRIOS 스캔은 Communicate로 지정 기공소에 보내고, 기공의뢰서는 어벗츠에서 작성하세요. 비 3Shape은 STL/PLY 등을 여기에 업로드하면 됩니다.";

  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-xs leading-relaxed text-slate-700",
        className,
      )}
    >
      <span>{text} </span>
      <Link
        to={settingsHref}
        className="font-medium text-primary-strong underline-offset-2 hover:underline"
      >
        자세히
      </Link>
    </div>
  );
};
