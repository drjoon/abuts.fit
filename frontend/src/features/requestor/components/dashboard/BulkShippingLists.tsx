export type BulkStage = "pre" | "post";

export type BulkShippingItem = {
  id: string;
  title: string;
  clinic: string;
  patient: string;
  tooth: string;
  diameter: string;
  stage?: BulkStage;
};

export const BulkShippingList = ({
  kind,
  items,
  selected,
  setSelected,
}: {
  kind: BulkStage;
  items: BulkShippingItem[];
  selected: Record<string, boolean>;
  setSelected: (next: Record<string, boolean>) => void;
}) => {
  const visible = items.filter((item) => !selected[item.id]);

  if (!visible.length) {
    return (
      <p className="text-[12px] text-muted-foreground">
        표시할 의뢰가 없습니다.
      </p>
    );
  }

  return (
    <div className="space-y-2 text-xs">
      {visible.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`w-full text-left flex items-start gap-2 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
            kind === "pre"
              ? "border-sky-300 bg-sky-50 hover:border-sky-400 hover:bg-sky-100"
              : "border-emerald-300 bg-emerald-50 hover:border-emerald-400 hover:bg-emerald-100"
          }`}
          onClick={() => {
            const next = { ...selected };
            next[item.id] = true;
            setSelected(next);
          }}
        >
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium truncate">{item.title}</div>
            <div className="text-[10px] text-muted-foreground flex flex-col gap-0.5 mt-1">
              <span>{item.clinic}</span>
              <span>
                환자 {item.patient} • 치아번호 {item.tooth} • 최대직경{" "}
                {item.diameter}
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};

export const BulkShippingStagingList = ({
  allItems,
  selected,
  setSelected,
}: {
  allItems: BulkShippingItem[];
  selected: Record<string, boolean>;
  setSelected: (next: Record<string, boolean>) => void;
}) => {
  const selectedItems = allItems.filter((item) => selected[item.id]);

  if (!selectedItems.length) {
    return (
      <p className="text-[12px] text-muted-foreground">
        왼쪽 목록에서 클릭하여 추가하세요.
      </p>
    );
  }

  return (
    <div className="space-y-2 text-xs">
      {selectedItems.map((item) => {
        const isSelected = !!selected[item.id];
        const stageColor =
          item.stage === "pre"
            ? "border-sky-300 bg-sky-50 hover:border-sky-400 hover:bg-sky-100"
            : item.stage === "post"
            ? "border-emerald-300 bg-emerald-50 hover:border-emerald-400 hover:bg-emerald-100"
            : "border-border bg-background hover:border-blue-300 hover:bg-blue-50/60";

        return (
          <button
            key={item.id}
            type="button"
            className={`w-full text-left flex items-start gap-2 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
              isSelected
                ? stageColor
                : "border-border bg-background hover:border-blue-300 hover:bg-blue-50/60"
            }`}
            onClick={() => {
              const next = { ...selected };
              if (isSelected) {
                delete next[item.id];
              } else {
                next[item.id] = true;
              }
              setSelected(next);
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium truncate">
                {item.title}
              </div>
              <div className="text-[10px] text-muted-foreground flex flex-col gap-0.5 mt-1">
                <span>{item.clinic}</span>
                <span>
                  환자 {item.patient} • 치아번호 {item.tooth} • 최대직경{" "}
                  {item.diameter}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
