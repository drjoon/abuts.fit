// 불완전가공 입력 — 프리뷰 위에 띄우는 별도 모달 본문.
// 사유는 칩으로 고르고, 문구 수정·삭제는 「관리」에서만 연다.
import { useState, type Ref } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  UnmachinableLabNoticeFields,
  type UnmachinableLabNoticeHandle,
} from "./UnmachinableLabNoticeFields";

type UnmachinableReasonPanelProps = {
  packing: boolean;
  labNoticeRef: Ref<UnmachinableLabNoticeHandle>;
  resetKey: string;
  reasons: string[];
  selected: string[];
  onToggle: (reason: string) => void;
  onRename: (index: number, previous: string, next: string) => void;
  onDelete: (index: number, reason: string) => void;
  draft: string;
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
};

export function UnmachinableReasonPanel({
  packing,
  labNoticeRef,
  resetKey,
  reasons,
  selected,
  onToggle,
  onRename,
  onDelete,
  draft,
  onDraftChange,
  onAdd,
  saving,
  onCancel,
  onSubmit,
}: UnmachinableReasonPanelProps) {
  const [manageOpen, setManageOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [notice, setNotice] = useState({ hasPhoto: false, hasMessage: false });

  const missing: string[] = [];
  if (!selected.length) missing.push("사유");
  if (packing && !notice.hasPhoto) missing.push("사진");
  if (packing && !notice.hasMessage) missing.push("메시지");
  const ready = missing.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-accent-muted bg-accent-soft/70 px-3 py-2.5 pr-12">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-accent-strong">불완전가공</div>
          <p className="mt-0.5 text-[11px] leading-5 text-slate-600">
            {packing
              ? "사유·사진·메시지를 기공소에 전달합니다."
              : "선택한 사유가 R&D 불완전가공에 기록됩니다."}
            <br />
            {packing ? "출고는 그대로 이어집니다." : "사유는 여러 개 고를 수 있습니다."}
          </p>
        </div>
        <button
          type="button"
          className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold ${
            manageOpen
              ? "border-slate-400 bg-slate-100 text-slate-800"
              : "border-slate-200 bg-white text-slate-600"
          }`}
          onClick={() => {
            setManageOpen((open) => !open);
            setEditIndex(null);
            setEditDraft("");
          }}
        >
          {manageOpen ? "선택으로" : "사유 관리"}
        </button>
      </div>

      <div
        className={
          packing
            ? "grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,0.9fr)_minmax(0,1.1fr)] overflow-hidden md:grid-cols-2 md:grid-rows-1"
            : "flex min-h-0 flex-1 flex-col overflow-hidden"
        }
      >
        <div className="flex min-h-0 flex-col overflow-hidden border-slate-200 border-b md:border-b-0 md:border-r">
          <div className="flex shrink-0 items-center gap-2 px-3 pt-3 text-[11px] font-semibold text-slate-700">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent-strong text-[10px] text-white">
              1
            </span>
            {manageOpen ? "사유 문구 관리" : "사유 선택"}
            {!manageOpen ? <span className="text-destructive">*</span> : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {manageOpen ? (
              <div className="space-y-1.5">
                {reasons.map((reason, idx) =>
                  editIndex === idx ? (
                    <div
                      key={`${reason}-${idx}`}
                      className="flex items-center gap-1 rounded border border-slate-200 bg-white p-1"
                    >
                      <input
                        value={editDraft}
                        onChange={(event) =>
                          setEditDraft(String(event.target.value || "").slice(0, 500))
                        }
                        className="h-8 flex-1 rounded border border-slate-200 px-2 text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => {
                          const next = editDraft.trim();
                          if (!next) return;
                          onRename(idx, reason, next);
                          setEditIndex(null);
                          setEditDraft("");
                        }}
                      >
                        저장
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 px-2 text-xs"
                        onClick={() => {
                          setEditIndex(null);
                          setEditDraft("");
                        }}
                      >
                        취소
                      </Button>
                    </div>
                  ) : (
                    <div
                      key={`${reason}-${idx}`}
                      className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1.5"
                    >
                      <span className="min-w-0 flex-1 break-words text-xs text-slate-700">
                        {reason}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setEditIndex(idx);
                          setEditDraft(reason);
                        }}
                      >
                        수정
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={() => onDelete(idx, reason)}
                      >
                        삭제
                      </Button>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {reasons.map((reason) => {
                  const isSelected = selected.includes(reason);
                  return (
                    <button
                      key={reason}
                      type="button"
                      aria-pressed={isSelected}
                      className={`inline-flex max-w-full items-start gap-1.5 rounded-full border px-3 py-1.5 text-left text-xs leading-5 ${
                        isSelected
                          ? "border-primary-strong bg-primary-soft text-primary-strong"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
                      }`}
                      onClick={() => onToggle(reason)}
                    >
                      {isSelected ? <Check className="mt-1 h-3 w-3 shrink-0" /> : null}
                      <span className="min-w-0 break-words">{reason}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1 border-t border-slate-200 bg-slate-50 p-2">
            <input
              value={draft}
              onChange={(event) =>
                onDraftChange(String(event.target.value || "").slice(0, 500))
              }
              placeholder="새 사유 입력 후 Enter"
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                event.preventDefault();
                onAdd();
              }}
              className="h-8 flex-1 rounded border border-slate-200 bg-white px-2 text-xs"
            />
            <Button
              type="button"
              size="sm"
              className="h-8 px-2 text-xs"
              disabled={saving || !draft.trim()}
              onClick={onAdd}
            >
              추가
            </Button>
          </div>
        </div>

        {packing ? (
          <div className="min-h-0 overflow-y-auto p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-slate-700">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent-strong text-[10px] text-white">
                2
              </span>
              기공소에 전달
            </div>
            <UnmachinableLabNoticeFields
              ref={labNoticeRef}
              resetKey={resetKey}
              onStateChange={setNotice}
            />
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 px-3 py-2">
        <span className={`text-[11px] ${ready ? "text-slate-500" : "text-accent-strong"}`}>
          {ready
            ? `사유 ${selected.length}개 선택됨`
            : `${missing.join("·")}을(를) 입력하세요`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={onCancel}
          >
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-accent-strong hover:bg-accent-strong"
            disabled={saving || !ready}
            onClick={onSubmit}
          >
            {saving ? "전달 중..." : packing ? "기공소에 전달" : "확인"}
          </Button>
        </div>
      </div>
    </div>
  );
}
