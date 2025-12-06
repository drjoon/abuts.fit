import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Props = {
  onOpenBulkModal: () => void;
};

export const RequestorBulkShippingBannerCard = ({ onOpenBulkModal }: Props) => {
  return (
    <Card className="relative flex flex-col rounded-2xl border border-orange-300 bg-orange-50/80 shadow-sm transition-all hover:shadow-lg flex-none">
      <CardHeader className="pb-0">
        <CardTitle className="text-base font-semibold"></CardTitle>
        <CardDescription className="text-md leading-relaxed text-orange-900/90">
          배송 대기중인 건들을 묶음 배송으로 신청할 수 있습니다. 배송비를
          절감하고 출고 일정을 관리해 보세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-right pt-4">
        <Button
          variant="default"
          className="whitespace-nowrap"
          onClick={onOpenBulkModal}
        >
          묶음 배송 신청하기
        </Button>
      </CardContent>
    </Card>
  );
};
