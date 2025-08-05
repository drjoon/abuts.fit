import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Building2, Upload, Save, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BusinessTabProps {
  userData: {
    companyName?: string;
  };
}

export const BusinessTab = ({ userData }: BusinessTabProps) => {
  const { toast } = useToast();

  const [businessData, setBusinessData] = useState({
    companyName: userData?.companyName || "",
    businessNumber: "123-45-67890",
    address: "서울시 강남구 테헤란로 123",
    detailAddress: "4층 401호",
    phone: "02-1234-5678",
    fax: "02-1234-5679",
    website: "https://company.com",
    businessHours: {
      weekday: "09:00 - 18:00",
      saturday: "09:00 - 15:00",
      sunday: "휴무"
    },
    businessLicense: null as File | null,
    description: "고품질 치과 기공물 제작 전문"
  });

  const handleSave = () => {
    toast({
      title: "설정이 저장되었습니다",
      description: "사업자 정보가 성공적으로 업데이트되었습니다.",
    });
  };

  const handleFileUpload = (file: File) => {
    setBusinessData(prev => ({ ...prev, businessLicense: file }));
    
    toast({
      title: "파일이 업로드되었습니다",
      description: `${file.name}이 성공적으로 업로드되었습니다.`,
    });
  };

  return (
    <Card className="shadow-elegant">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          사업자 정보
        </CardTitle>
        <CardDescription>
          회사 정보와 사업자 등록증을 관리하세요
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">회사명</Label>
            <Input
              id="companyName"
              value={businessData.companyName}
              onChange={(e) => setBusinessData(prev => ({ ...prev, companyName: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="businessNumber">사업자등록번호</Label>
            <Input
              id="businessNumber"
              value={businessData.businessNumber}
              onChange={(e) => setBusinessData(prev => ({ ...prev, businessNumber: e.target.value }))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">주소</Label>
          <Input
            id="address"
            value={businessData.address}
            onChange={(e) => setBusinessData(prev => ({ ...prev, address: e.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="detailAddress">상세주소</Label>
          <Input
            id="detailAddress"
            value={businessData.detailAddress}
            onChange={(e) => setBusinessData(prev => ({ ...prev, detailAddress: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="businessPhone">대표번호</Label>
            <Input
              id="businessPhone"
              value={businessData.phone}
              onChange={(e) => setBusinessData(prev => ({ ...prev, phone: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fax">팩스번호</Label>
            <Input
              id="fax"
              value={businessData.fax}
              onChange={(e) => setBusinessData(prev => ({ ...prev, fax: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">웹사이트</Label>
            <Input
              id="website"
              value={businessData.website}
              onChange={(e) => setBusinessData(prev => ({ ...prev, website: e.target.value }))}
            />
          </div>
        </div>

        {/* Business Hours */}
        <div className="space-y-4">
          <Label>영업시간</Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">평일</Label>
              <Input
                value={businessData.businessHours.weekday}
                onChange={(e) => setBusinessData(prev => ({
                  ...prev,
                  businessHours: { ...prev.businessHours, weekday: e.target.value }
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">토요일</Label>
              <Input
                value={businessData.businessHours.saturday}
                onChange={(e) => setBusinessData(prev => ({
                  ...prev,
                  businessHours: { ...prev.businessHours, saturday: e.target.value }
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">일요일</Label>
              <Input
                value={businessData.businessHours.sunday}
                onChange={(e) => setBusinessData(prev => ({
                  ...prev,
                  businessHours: { ...prev.businessHours, sunday: e.target.value }
                }))}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">회사 소개</Label>
          <Textarea
            id="description"
            value={businessData.description}
            onChange={(e) => setBusinessData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="회사 소개 및 전문 분야를 입력하세요"
          />
        </div>

        {/* Business License Upload */}
        <div className="space-y-2">
          <Label>사업자등록증</Label>
          <div className="border-2 border-dashed border-border rounded-lg p-4">
            <div className="text-center">
              <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <label className="cursor-pointer">
                <Button variant="outline">
                  <Upload className="mr-2 h-4 w-4" />
                  파일 업로드
                </Button>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                />
              </label>
              <p className="text-xs text-muted-foreground mt-2">
                PDF, JPG, PNG 파일만 가능 (최대 10MB)
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            저장하기
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
