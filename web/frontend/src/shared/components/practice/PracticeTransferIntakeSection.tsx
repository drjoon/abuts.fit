import { PracticeTransferMiddleGrid } from "@/shared/components/practice/PracticeTransferMiddleGrid";
import {
  PracticeTransferFilePane,
  type PracticeTransferFilePaneProps,
} from "@/shared/components/practice/PracticeTransferFilePane";
import {
  PracticeTransferRequestIntakePanel,
  type PracticeTransferRequestIntakePanelProps,
} from "@/shared/components/practice/PracticeTransferRequestIntakePanel";

// related files:
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferMiddleGrid.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferFeeEstimate.tsx
// - 2026-08-20: Expert — 헤더 → 메모|드롭존 2열 → 보철물. 높이 맞춤.
// - 2026-09-05: 파일 패널 고유 높이 → 메모 카드가 맞춤(fillHeight stretch 제거).

type PracticeTransferIntakeSectionProps = {
  filePaneProps: PracticeTransferFilePaneProps;
  requestIntakeProps: PracticeTransferRequestIntakePanelProps;
  middleGridClassName?: string;
};

export const PracticeTransferIntakeSection = ({
  filePaneProps,
  requestIntakeProps,
  middleGridClassName,
}: PracticeTransferIntakeSectionProps) => {
  return (
    <PracticeTransferMiddleGrid className={middleGridClassName}>
      <PracticeTransferRequestIntakePanel
        {...requestIntakeProps}
        showFeeEstimate
        besideMemoContent={<PracticeTransferFilePane {...filePaneProps} />}
      />
    </PracticeTransferMiddleGrid>
  );
};
