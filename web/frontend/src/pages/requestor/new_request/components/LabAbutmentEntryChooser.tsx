// related files:
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - docs/intent/lab-custom-abutment-scan-vs-stl-entry.md
import { Button } from "@/components/ui/button";

export type LabAbutmentEntryMode = "scan" | "stl";

type Props = {
  onChoose: (mode: LabAbutmentEntryMode) => void;
};

export function LabAbutmentEntryChooser({ onChoose }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-slate-900">
          커스텀어벗 의뢰 — 시작 자료
        </h2>
        <p className="text-sm text-slate-600">
          구강 스캔으로 자동 디자인한 뒤 생산하거나,
          <br />
          이미 있는 어벗 STL로 바로 생산합니다.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <Button
          type="button"
          className="h-11 flex-1 font-semibold"
          onClick={() => onChoose("scan")}
        >
          구강 스캔으로 디자인
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1 font-semibold"
          onClick={() => onChoose("stl")}
        >
          어벗 STL로 생산
        </Button>
      </div>
    </div>
  );
}
