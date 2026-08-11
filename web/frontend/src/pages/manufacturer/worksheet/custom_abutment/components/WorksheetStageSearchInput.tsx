// related files:
// - web/frontend/src/pages/manufacturer/equipment/cnc/components/SelfInspectionReportModal.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// note: 워크시트 공정 페이지 검색은 헤더 worksheetSearch SSOT. 이 컴포넌트는 모달 등 독립 검색 UI용.
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
    <div className={`w-full md:max-w-[560px] lg:max-w-[640px] ${className}`.trim()}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="ml-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-slate-300"
      />
    </div>
  );
};
