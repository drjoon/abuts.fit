// change-log:
// - 2026-09-27: 작업열기 후 안내 — 3Shape·exocad는 파일 인자 열기가 없어 「스캔 가져오기 + 경로 붙여넣기」 3단계.
// related files:
// - web/frontend/src/shared/files/labCadHelperClient.ts
// - bg/lab-cad-helper/lab-cad-helper.ps1
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/shared/hooks/use-toast";
import type {
  LabCadOpenGuide,
  LabCadOpenResult,
} from "@/shared/files/labCadHelperClient";
import { Copy } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

const SKIP_KEY_PREFIX = "abuts.labCadOpenedGuideSkip.";

/** 안내 없이 토스트만 띄울 결과인지 */
export function shouldSkipLabCadOpenedGuide(result: LabCadOpenResult): boolean {
  if (result.guide === "exocad_project" || result.guide === "args") return true;
  try {
    return localStorage.getItem(SKIP_KEY_PREFIX + result.guide) === "1";
  } catch {
    return false;
  }
}

function writeSkip(guide: LabCadOpenGuide, skip: boolean) {
  try {
    if (skip) localStorage.setItem(SKIP_KEY_PREFIX + guide, "1");
    else localStorage.removeItem(SKIP_KEY_PREFIX + guide);
  } catch {
    // ignore
  }
}

type GuideCopy = {
  title: string;
  lead: ReactNode;
  steps: ReactNode[];
  note?: ReactNode;
};

function guideCopy(result: LabCadOpenResult, isMac: boolean): GuideCopy {
  const pasteStep = (
    <>
      파일 창 주소 칸에 <b>Ctrl+V</b> 후 파일을 고릅니다.
    </>
  );
  if (result.guide === "3shape_import") {
    return {
      title: "3Shape에서 스캔 가져오기",
      lead: (
        <>
          파일을 작업 폴더에 저장하고 Dental Manager를 열었습니다.
          {result.clipboard ? (
            <>
              <br />
              폴더 경로는 복사해 두었습니다.
            </>
          ) : null}
        </>
      ),
      steps: [
        <>Dental Manager에서 새 주문을 만듭니다.</>,
        <>
          주문을 오른쪽 클릭 › <b>스캔 가져오기(Import scan)</b>를 누릅니다.
        </>,
        pasteStep,
      ],
      note: <>3Shape는 외부 파일을 바로 여는 기능이 없어 가져오기가 필요합니다.</>,
    };
  }
  if (result.guide === "exocad_import") {
    return {
      title: "exocad에서 스캔 가져오기",
      lead: (
        <>
          파일을 작업 폴더에 저장하고 DentalDB를 열었습니다.
          {result.clipboard ? (
            <>
              <br />
              폴더 경로는 복사해 두었습니다.
            </>
          ) : null}
        </>
      ),
      steps: [
        <>DentalDB에서 환자·작업을 입력하고 저장합니다.</>,
        <>스캔 파일을 불러오는 창을 엽니다.</>,
        pasteStep,
      ],
      note: <>exocad는 DentalDB에서 만든 작업만 바로 열 수 있습니다.</>,
    };
  }
  return {
    title: "작업 폴더에 저장했습니다",
    lead: isMac ? (
      <>
        Mac에서는 3Shape·exocad를 실행할 수 없습니다.
        <br />
        파일을 저장하고 폴더를 열었습니다.
      </>
    ) : (
      <>파일을 저장하고 폴더를 열었습니다.</>
    ),
    steps: [],
  };
}

type LabCadOpenedGuideDialogProps = {
  result: LabCadOpenResult | null;
  isMac?: boolean;
  onClose: () => void;
  onChangeWorkFolder?: () => void;
};

export function LabCadOpenedGuideDialog({
  result,
  isMac = false,
  onClose,
  onChangeWorkFolder,
}: LabCadOpenedGuideDialogProps) {
  const { toast } = useToast();
  const [skip, setSkip] = useState(false);

  useEffect(() => {
    if (result) setSkip(false);
  }, [result]);

  if (!result) return null;
  const copy = guideCopy(result, isMac);

  const handleClose = () => {
    if (skip) writeSkip(result.guide, true);
    onClose();
  };

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(result.folder);
      toast({ title: "경로를 복사했습니다", description: result.folder });
    } catch {
      toast({
        title: "복사하지 못했습니다",
        description: "경로를 직접 선택해 복사해 주세요.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <DialogContent className="z-[320] max-w-md gap-0 p-0 sm:rounded-lg">
        <DialogHeader className="space-y-1.5 border-b px-5 py-4 text-left">
          <DialogTitle className="text-base">{copy.title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {copy.lead}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4 text-sm">
          {copy.steps.length ? (
            <ol className="space-y-2">
              {copy.steps.map((step, idx) => (
                <li key={idx} className="flex gap-2 leading-relaxed">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                    {idx + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          ) : null}

          {result.folder ? (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
              <p className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground" title={result.folder}>
                {result.folder}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2"
                onClick={() => void handleCopyPath()}
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                복사
              </Button>
            </div>
          ) : null}

          {copy.note ? (
            <p className="text-[12px] leading-relaxed text-muted-foreground">{copy.note}</p>
          ) : null}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t px-5 py-3 sm:justify-between">
          <div className="flex items-center gap-3">
            {copy.steps.length ? (
              <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-muted-foreground">
                <Checkbox
                  checked={skip}
                  onCheckedChange={(checked) => setSkip(checked === true)}
                />
                다음부터 생략
              </label>
            ) : null}
            {onChangeWorkFolder ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-0 text-[12px] text-muted-foreground"
                onClick={() => {
                  handleClose();
                  onChangeWorkFolder();
                }}
              >
                작업 폴더 변경
              </Button>
            ) : null}
          </div>
          <Button type="button" size="sm" onClick={handleClose}>
            확인
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
