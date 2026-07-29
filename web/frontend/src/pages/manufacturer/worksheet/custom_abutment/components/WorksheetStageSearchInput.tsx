// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/backend/controllers/requests/common.review.controller.js
type WorksheetStageSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

const DEFAULT_PLACEHOLDER =
  "검색: 의뢰자명 · 치과명 · 환자명 · 치아번호 · 날짜 · 요일 · 로트번호 · 의뢰번호";

export const WorksheetStageSearchInput = ({
  value,
  onChange,
  placeholder = DEFAULT_PLACEHOLDER,
  className = "",
}: WorksheetStageSearchInputProps) => {
  return (
    <div className={className || undefined}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-slate-300"
      />
    </div>
  );
};
