import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard } from "lucide-react";

export const PricingTab = () => {
  const [pricingData, setPricingData] = useState({
    standardAbutment: "150000",
    premiumAbutment: "250000",
    customAbutment: "400000",
    urgentFee: "50000",
    revisionFee: "30000",
    minOrder: "100000",
  });

  const storageKey = useMemo(() => {
    return "abutsfit:pricing-settings:v1";
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      setPricingData((prev) => ({
        ...prev,
        ...(parsed as any),
      }));
    } catch {
      // ignore
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(pricingData));
    } catch {
      // ignore
    }
  }, [pricingData, storageKey]);

  return (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          가격 설정
        </CardTitle>
        <CardDescription>제품 및 서비스 가격을 설정하세요</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="standardAbutment">기본 어버트먼트 (원)</Label>
            <Input
              id="standardAbutment"
              value={pricingData.standardAbutment}
              onChange={(e) =>
                setPricingData((prev) => ({
                  ...prev,
                  standardAbutment: e.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="premiumAbutment">프리미엄 어버트먼트 (원)</Label>
            <Input
              id="premiumAbutment"
              value={pricingData.premiumAbutment}
              onChange={(e) =>
                setPricingData((prev) => ({
                  ...prev,
                  premiumAbutment: e.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customAbutment">맞춤형 어버트먼트 (원)</Label>
            <Input
              id="customAbutment"
              value={pricingData.customAbutment}
              onChange={(e) =>
                setPricingData((prev) => ({
                  ...prev,
                  customAbutment: e.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="urgentFee">긴급 처리 추가 요금 (원)</Label>
            <Input
              id="urgentFee"
              value={pricingData.urgentFee}
              onChange={(e) =>
                setPricingData((prev) => ({
                  ...prev,
                  urgentFee: e.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="revisionFee">수정 요청 추가 요금 (원)</Label>
            <Input
              id="revisionFee"
              value={pricingData.revisionFee}
              onChange={(e) =>
                setPricingData((prev) => ({
                  ...prev,
                  revisionFee: e.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minOrder">최소 주문 금액 (원)</Label>
            <Input
              id="minOrder"
              value={pricingData.minOrder}
              onChange={(e) =>
                setPricingData((prev) => ({
                  ...prev,
                  minOrder: e.target.value,
                }))
              }
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
