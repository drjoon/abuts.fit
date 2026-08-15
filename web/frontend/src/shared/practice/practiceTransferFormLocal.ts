// related files:
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/rules.md
/**
 * practice 의뢰 폼 localStorage SSOT.
 * 드롭존(`/practice/dropzone`)과 대시보드(`/practice/dashboard`)가
 * 동일 키로 폼을 이어 쓴다. 드롭존 전용 필드(가입/이메일 등)는
 * `practice_dropzone_draft_v2`에만 둔다.
 */

import type { ToothWorkSelection } from "@/shared/practice/transferMemo";

export const PRACTICE_TRANSFER_FORM_LOCAL_KEY = "practice_transfer_form_local_v1";
export const PRACTICE_TRANSFER_TEMP_DRAFT_KEY = "practice_transfer_temp_draft_v1";
export const PRACTICE_DROPZONE_DRAFT_KEY = "practice_dropzone_draft_v2";

export type PracticeTransferFormLocalLab = {
  _id?: string;
  name?: string;
  businessNumber?: string;
  representativeName?: string;
  address?: string;
  businessType?: string;
};

export type PracticeTransferFormLocalDraft = {
  orderDate?: string;
  arrivalDate?: string;
  arrivalDefaultDays?: number;
  prosthesisTypes?: string[];
  requestMemo?: string;
  patientName?: string;
  selectedLab?: PracticeTransferFormLocalLab | null;
  toothWorks?: ToothWorkSelection[];
  /** 의뢰건별 「디자인 컨펌 생략」. 계정 세팅이 아님 */
  skipDesignConfirm?: boolean;
  /** 전송/삭제된 draft가 localStorage로 다시 복원되지 않도록 추적 */
  activeDraftId?: string | null;
  updatedAt?: number;
};

type DropzoneDraftLike = {
  selectedLab?: PracticeTransferFormLocalLab | null;
  requestMemo?: string;
  orderDate?: string;
  arrivalDate?: string;
  arrivalDefaultDays?: number;
  prosthesisTypes?: string[];
  toothWorks?: ToothWorkSelection[];
  patientName?: string;
};

const hasMeaningfulFormContent = (draft: PracticeTransferFormLocalDraft | null) => {
  if (!draft) return false;
  if (String(draft.patientName || "").trim()) return true;
  if (String(draft.requestMemo || "").trim()) return true;
  if (draft.selectedLab && String(draft.selectedLab.name || "").trim()) return true;
  if (
    Array.isArray(draft.toothWorks) &&
    draft.toothWorks.some((row) => String(row?.toothNumber || "").trim())
  ) {
    return true;
  }
  return false;
};

export const readPracticeTransferFormLocal = (): PracticeTransferFormLocalDraft | null => {
  try {
    const raw = localStorage.getItem(PRACTICE_TRANSFER_FORM_LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PracticeTransferFormLocalDraft;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
};

export const writePracticeTransferFormLocal = (
  draft: PracticeTransferFormLocalDraft,
): number => {
  const updatedAt =
    Number.isFinite(Number(draft.updatedAt)) && Number(draft.updatedAt) > 0
      ? Number(draft.updatedAt)
      : Date.now();
  const payload: PracticeTransferFormLocalDraft = {
    ...draft,
    updatedAt,
  };
  try {
    localStorage.setItem(PRACTICE_TRANSFER_FORM_LOCAL_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
  return updatedAt;
};

export const clearPracticeTransferFormLocalStorage = () => {
  try {
    localStorage.removeItem(PRACTICE_TRANSFER_TEMP_DRAFT_KEY);
    localStorage.removeItem(PRACTICE_TRANSFER_FORM_LOCAL_KEY);
  } catch {
    // ignore
  }
};

/** 전송/초기화 후 드롭존·대시보드 폼이 되살아나지 않게 둘 다 지운다. */
export const clearPracticeSharedFormLocalStorage = () => {
  clearPracticeTransferFormLocalStorage();
  try {
    localStorage.removeItem(PRACTICE_DROPZONE_DRAFT_KEY);
  } catch {
    // ignore
  }
};

export const syncIntakeFieldsToTransferFormLocal = (fields: {
  orderDate: string;
  arrivalDate: string;
  arrivalDefaultDays: number;
  prosthesisTypes: string[];
  requestMemo: string;
  patientName: string;
  selectedLab: PracticeTransferFormLocalLab | null;
  toothWorks: ToothWorkSelection[];
  skipDesignConfirm?: boolean;
  activeDraftId?: string | null;
}): number => {
  const existing = readPracticeTransferFormLocal();
  return writePracticeTransferFormLocal({
    orderDate: fields.orderDate,
    arrivalDate: fields.arrivalDate,
    arrivalDefaultDays: fields.arrivalDefaultDays,
    prosthesisTypes: fields.prosthesisTypes,
    requestMemo: fields.requestMemo,
    patientName: fields.patientName,
    selectedLab: fields.selectedLab,
    toothWorks: fields.toothWorks,
    skipDesignConfirm:
      fields.skipDesignConfirm !== undefined
        ? fields.skipDesignConfirm !== false
        : existing?.skipDesignConfirm !== false,
    activeDraftId:
      fields.activeDraftId !== undefined
        ? fields.activeDraftId
        : existing?.activeDraftId ?? null,
    updatedAt: Date.now(),
  });
};

/**
 * 대시보드 hydrate 시 transfer form이 비어 있으면 드롭존 draft에서 폼을 이관한다.
 */
export const adoptDropzoneDraftIntoTransferFormIfNeeded =
  (): PracticeTransferFormLocalDraft | null => {
    const existing = readPracticeTransferFormLocal();
    if (hasMeaningfulFormContent(existing)) return existing;

    try {
      const raw = localStorage.getItem(PRACTICE_DROPZONE_DRAFT_KEY);
      if (!raw) return existing;
      const parsed = JSON.parse(raw) as DropzoneDraftLike;
      if (!parsed || typeof parsed !== "object") return existing;

      const migrated: PracticeTransferFormLocalDraft = {
        orderDate: String(parsed.orderDate || "").trim() || undefined,
        arrivalDate: String(parsed.arrivalDate || "").trim() || undefined,
        arrivalDefaultDays: Number(parsed.arrivalDefaultDays),
        prosthesisTypes: Array.isArray(parsed.prosthesisTypes)
          ? parsed.prosthesisTypes
          : undefined,
        requestMemo: String(parsed.requestMemo || ""),
        patientName: String(parsed.patientName || ""),
        selectedLab: parsed.selectedLab || null,
        toothWorks: Array.isArray(parsed.toothWorks) ? parsed.toothWorks : [],
        skipDesignConfirm: existing?.skipDesignConfirm !== false,
        activeDraftId: existing?.activeDraftId ?? null,
        updatedAt: Date.now(),
      };

      if (!hasMeaningfulFormContent(migrated) && !migrated.orderDate && !migrated.arrivalDate) {
        return existing;
      }

      writePracticeTransferFormLocal(migrated);
      return migrated;
    } catch {
      return existing;
    }
  };

/**
 * 드롭존 hydrate: transfer form이 더 최신이면 의뢰 필드를 그쪽에서 가져온다.
 */
export const readPreferredIntakeFormForDropzone = (
  dropzoneDraft: DropzoneDraftLike | null,
): PracticeTransferFormLocalDraft | null => {
  const transfer = readPracticeTransferFormLocal();
  const transferUpdatedAt = Number(transfer?.updatedAt || 0);
  if (hasMeaningfulFormContent(transfer) && transferUpdatedAt > 0) {
    return transfer;
  }
  if (!dropzoneDraft) return transfer;
  return {
    orderDate: dropzoneDraft.orderDate,
    arrivalDate: dropzoneDraft.arrivalDate,
    arrivalDefaultDays: dropzoneDraft.arrivalDefaultDays,
    prosthesisTypes: dropzoneDraft.prosthesisTypes,
    requestMemo: dropzoneDraft.requestMemo,
    patientName: dropzoneDraft.patientName,
    selectedLab: dropzoneDraft.selectedLab || null,
    toothWorks: dropzoneDraft.toothWorks,
    skipDesignConfirm: transfer?.skipDesignConfirm !== false,
  };
};
