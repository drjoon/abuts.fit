import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { RequestDesignSoftwareMode } from "./newRequestDetailsUtils";

// related files:
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/frontend/src/pages/requestor/new_request/components/NewRequestAttachmentsPanel.tsx
// - web/frontend/src/pages/requestor/new_request/components/newRequestDetailsUtils.ts
// - web/frontend/src/pages/requestor/new_request/hooks/useCompanionBinding.ts

type ToastFn = (props: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: string;
  duration?: number;
}) => void;

type Props = {
  companionPromptOpen: boolean;
  setCompanionPromptOpen: (open: boolean) => void;
  onBypassMissingCompanion: () => void;
  onUploadCompanion: () => void;
  pendingCompanionReplace: { stlFileKey: string; companionFileKey: string } | null;
  setPendingCompanionReplace: (
    value: { stlFileKey: string; companionFileKey: string } | null,
  ) => void;
  onConfirmReplace: (stlFileKey: string, companionFileKey: string) => void;
  toast: ToastFn;
  designSoftwareMode: RequestDesignSoftwareMode | null;
};

export function NewRequestCompanionDialogs({
  companionPromptOpen,
  setCompanionPromptOpen,
  onBypassMissingCompanion,
  onUploadCompanion,
  pendingCompanionReplace,
  setPendingCompanionReplace,
  onConfirmReplace,
  toast,
  designSoftwareMode,
}: Props) {
  const guidance =
    designSoftwareMode === "3Shape"
      ? "STL과 함께 .xml 구성정보 파일을 올려주세요."
      : designSoftwareMode === "ExoCAD"
        ? "STL과 함께 .constructionInfo 파일을 올려주세요."
        : "직접 입력으로 설정되어 있어 구성정보 파일은 필수가 아닙니다. 필요할 때만 추가해 주세요.";
  return (
    <>
      <AlertDialog
        open={companionPromptOpen}
        onOpenChange={(open) => {
          setCompanionPromptOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>구성정보 파일도 함께 올릴까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {guidance}
              <br />
              없으면 이번에는 구성정보 없이 진행할 수 있어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onBypassMissingCompanion}>
              구성정보 없이 진행
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onUploadCompanion();
                setCompanionPromptOpen(false);
              }}
            >
              {designSoftwareMode === "ExoCAD"
                ? ".constructionInfo 파일 업로드"
                : designSoftwareMode === "3Shape"
                  ? ".xml 파일 업로드"
                  : "구성정보 파일 업로드(선택)"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!pendingCompanionReplace}
        onOpenChange={(open) => {
          if (!open) {
            setPendingCompanionReplace(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>구성정보를 교체할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              이미 이 STL 케이스에 구성정보가 연결되어 있습니다.
              <br />
              새로 선택한 구성정보로 교체하면 기존 연결은 해제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPendingCompanionReplace(null);
              }}
            >
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingCompanionReplace) return;
                onConfirmReplace(
                  pendingCompanionReplace.stlFileKey,
                  pendingCompanionReplace.companionFileKey,
                );
                setPendingCompanionReplace(null);
                toast({
                  title: "구성정보를 교체했어요",
                  description: "새 구성정보를 이 STL 케이스에 연결했습니다.",
                  duration: 2200,
                });
              }}
            >
              교체하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
