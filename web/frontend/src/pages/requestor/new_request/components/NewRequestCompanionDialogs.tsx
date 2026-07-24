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
}: Props) {
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
              지금은 STL만 첨부되었어요.
              <br />
              <strong>xml(3Shape)</strong> 또는 <strong>constructionInfo (ExoCAD)</strong>
              파일을 함께 올려주세요.
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
              구성정보 파일 업로드
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
