// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/VialStickerPrintDialog.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingLabelPrintDialog.tsx

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

export function LabelPrinterField({
  value,
  onChange,
  options,
  loading,
  error,
  onRefresh,
}: Props) {
  const listed =
    value && !options.includes(value) ? [value, ...options] : options;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs font-medium text-stone-500">
          프린터
        </span>
        <select
          value={value}
          title={value || "프린터 선택"}
          disabled={loading}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-900 outline-none focus:ring-2 focus:ring-stone-900/20 disabled:bg-stone-50"
        >
          {loading ? (
            <option value={value}>프린터 목록 불러오는 중...</option>
          ) : (
            <>
              <option value="">선택</option>
              {listed.map((printer) => (
                <option key={printer} value={printer} title={printer}>
                  {printer}
                </option>
              ))}
            </>
          )}
        </select>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="h-9 shrink-0 rounded-xl border border-stone-200 bg-white px-2.5 text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-300"
        >
          새로고침
        </button>
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : !loading && options.length === 0 ? (
        <p className="text-xs text-stone-500">사용 가능한 프린터가 없습니다.</p>
      ) : null}
    </div>
  );
}
