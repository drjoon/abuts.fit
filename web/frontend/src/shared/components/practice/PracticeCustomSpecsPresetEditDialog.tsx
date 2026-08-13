// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/components/practice/PracticeToothImplantFields.tsx
// - web/frontend/src/shared/components/practice/PracticeToothAbutmentFields.tsx
// - web/frontend/src/pages/requestor/new_request/components/NewRequestDesignAbutmentFields.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/practice/roundBarAbutment.ts
// change-log:
// - 2026-08-14: 치과 프리셋 편집에서 제조사 추가 요청(환봉) UI는 ImplantFields가 담당.
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PracticeToothAbutmentFields,
  type ToothAbutmentValues,
} from "@/shared/components/practice/PracticeToothAbutmentFields";
import {
  PracticeToothImplantFields,
  type ToothImplantValues,
} from "@/shared/components/practice/PracticeToothImplantFields";
import type { ImplantConnection } from "@/shared/practice/useImplantConnectionCatalog";
import type {
  PracticeAbutmentFavorite,
  PracticeImplantFavorite,
} from "@/shared/practice/transferMemo";
import { cn } from "@/shared/ui/cn";

export type PracticeCustomSpecsValue = ToothImplantValues & ToothAbutmentValues;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: PracticeCustomSpecsValue;
  onImplantChange: (next: ToothImplantValues) => void;
  onAbutmentChange: (next: ToothAbutmentValues) => void;
  connections: ImplantConnection[];
  implantFavorites: PracticeImplantFavorite[];
  onImplantFavoritesChange?: (next: PracticeImplantFavorite[]) => void | Promise<void>;
  abutmentFavorites: PracticeAbutmentFavorite[];
  onAbutmentFavoritesChange?: (next: PracticeAbutmentFavorite[]) => void | Promise<void>;
  className?: string;
  overlayClassName?: string;
};

/**
 * 파일의뢰·기공의뢰서 공통 프리셋 편집 모달.
 * 데이터(favorites)는 호출측에서 각각 주입 — 모달은 UI만 공유한다.
 */
export const PracticeCustomSpecsPresetEditDialog = ({
  open,
  onOpenChange,
  value,
  onImplantChange,
  onAbutmentChange,
  connections,
  implantFavorites,
  onImplantFavoritesChange,
  abutmentFavorites,
  onAbutmentFavoritesChange,
  className,
  overlayClassName,
}: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      className={cn("max-h-[92vh] gap-4 overflow-y-auto sm:max-w-3xl", className)}
      overlayClassName={overlayClassName}
    >
      <DialogHeader className="space-y-1.5 text-left">
        <DialogTitle className="text-lg">프리셋 편집</DialogTitle>
        <DialogDescription className="text-sm">
          임플란트·스캔바디를 직접 선택하고, 자주 쓰는 조합을 프리셋으로 저장·수정·삭제할 수
          있습니다.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2">
        <PracticeToothImplantFields
          className="h-full min-h-0"
          value={value}
          onChange={onImplantChange}
          connections={connections}
          favorites={implantFavorites}
          onFavoritesChange={onImplantFavoritesChange}
        />
        <PracticeToothAbutmentFields
          className="h-full min-h-0"
          heading="스캔바디"
          value={value}
          onChange={onAbutmentChange}
          favorites={abutmentFavorites}
          onFavoritesChange={onAbutmentFavoritesChange}
        />
      </div>

      <DialogFooter>
        <Button
          type="button"
          className="h-10 min-w-[6rem] text-sm"
          onClick={() => onOpenChange(false)}
        >
          완료
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
