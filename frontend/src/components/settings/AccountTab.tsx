import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { User, Upload, Save, Camera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AccountTabProps {
  userData: {
    name: string;
    email: string;
    role?: string;
  };
}

export const AccountTab = ({ userData }: AccountTabProps) => {
  const { toast } = useToast();

  const STORAGE_KEY_PREFIX = "abutsfit:shipping-policy:v1:";
  const storageKey = `${STORAGE_KEY_PREFIX}${userData?.email || "guest"}`;

  const [accountData, setAccountData] = useState({
    name: userData?.name || "",
    email: userData?.email || "",
    phone: "010-1234-5678",
    profileImage: null as File | null,
  });

  const [shippingOption, setShippingOption] = useState<"count3" | "monThu">(
    () => {
      try {
        const raw = storageKey ? localStorage.getItem(storageKey) : null;
        if (!raw) return "count3";
        const parsed = JSON.parse(raw) as { option?: string };
        return (parsed.option as "count3" | "monThu") || "count3";
      } catch {
        return "count3";
      }
    }
  );

  useEffect(() => {
    // 이메일이 바뀌는 경우를 대비해 재로딩
    try {
      const nextKey = `${STORAGE_KEY_PREFIX}${userData?.email || "guest"}`;
      const raw = localStorage.getItem(nextKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { option?: string };
      if (parsed.option === "count3" || parsed.option === "monThu") {
        setShippingOption(parsed.option);
      }
    } catch {
      // ignore
    }
  }, [userData?.email]);

  const handleSave = () => {
    try {
      const payload = { option: shippingOption };
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // ignore localStorage errors
    }

    toast({
      title: "설정이 저장되었습니다",
      description: "계정 설정이 성공적으로 업데이트되었습니다.",
    });
  };

  const handleFileUpload = (file: File) => {
    setAccountData((prev) => ({ ...prev, profileImage: file }));

    toast({
      title: "파일이 업로드되었습니다",
      description: `${file.name}이 성공적으로 업로드되었습니다.`,
    });
  };

  return (
    <Card className="relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm transition-all hover:shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          계정 설정
        </CardTitle>
        <CardDescription>개인 정보와 로그인 설정을 관리하세요</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Profile Image */}
        <div className="space-y-2">
          <Label>프로필 이미지</Label>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Camera className="h-8 w-8 text-primary" />
            </div>
            <div>
              <label className="cursor-pointer">
                <Button variant="outline" size="sm">
                  <Upload className="mr-2 h-4 w-4" />
                  이미지 업로드
                </Button>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={(e) =>
                    e.target.files?.[0] && handleFileUpload(e.target.files[0])
                  }
                />
              </label>
              <p className="text-xs text-muted-foreground mt-1">
                JPG, PNG 파일만 가능 (최대 5MB)
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">이름</Label>
            <Input
              id="name"
              value={accountData.name}
              onChange={(e) =>
                setAccountData((prev) => ({ ...prev, name: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              value={accountData.email}
              onChange={(e) =>
                setAccountData((prev) => ({ ...prev, email: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">연락처</Label>
            <Input
              id="phone"
              value={accountData.phone}
              onChange={(e) =>
                setAccountData((prev) => ({ ...prev, phone: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>사용자 권한</Label>
            <div className="flex items-center gap-2">
              <Badge
                variant={userData?.role === "admin" ? "destructive" : "default"}
              >
                {userData?.role === "requestor"
                  ? "의뢰자"
                  : userData?.role === "manufacturer"
                  ? "제조사"
                  : "어벗츠.핏"}
              </Badge>
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
