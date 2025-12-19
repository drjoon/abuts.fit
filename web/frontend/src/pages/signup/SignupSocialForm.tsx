import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SignupSocialFormProps {
  formData: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
    company: string;
    phone: string;
    requestorType: "" | "owner" | "co_owner" | "staff";
  };
  isLoading: boolean;
  isSocialCompleteMode: boolean;
  isSocialNewMode: boolean;
  user: any;
  onFormChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFormDataChange: (updater: (prev: any) => any) => void;
  onSubmit: (e: React.FormEvent) => void;
  onNavigateLogin: () => void;
}

export const SignupSocialForm = ({
  formData,
  isLoading,
  isSocialCompleteMode,
  isSocialNewMode,
  user,
  onFormChange,
  onFormDataChange,
  onSubmit,
  onNavigateLogin,
}: SignupSocialFormProps) => {
  return (
    <>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 mb-3">
          <Button
            variant="outline"
            type="button"
            className="w-full h-12 flex items-center justify-center text-base"
            onClick={() => {
              window.location.href = "/api/auth/oauth/google/start";
            }}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Google
          </Button>
          <Button
            variant="outline"
            type="button"
            className="w-full h-12 flex items-center justify-center text-base"
            onClick={() => {
              window.location.href = "/api/auth/oauth/kakao/start";
            }}
          >
            <svg className="mr-1 h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="#FEE500"
                d="M12 3c5.799 0 9 3.25 9 7.5 0 4.326-4.64 8.5-9 8.5-1.12 0-2.25-.16-3.33-.48-.36-.11-.735-.06-1.035.135L5.4 19.8c-.27.18-.63.12-.81-.12-.06-.09-.09-.21-.09-.33v-2.4c0-.33-.18-.63-.45-.78C2.46 15.445 1.5 13.395 1.5 11.25 1.5 6.75 5.85 3 12 3z"
              />
            </svg>
            카카오
          </Button>
        </div>
      </div>

      <div className="pt-4 relative flex justify-center text-xs uppercase">
        <span className="bg-background px-2 text-muted-foreground">또는</span>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {isSocialCompleteMode && (
          <div className="space-y-2">
            <Label>소셜 계정</Label>
            <div className="text-sm text-muted-foreground break-all">
              {user?.email || ""}
            </div>
          </div>
        )}
        <div>
          <Label>의뢰자 유형</Label>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <Button
              type="button"
              variant={
                formData.requestorType === "owner" ? "default" : "outline"
              }
              onClick={() =>
                onFormDataChange((prev) => ({
                  ...prev,
                  requestorType: "owner",
                }))
              }
            >
              주대표
            </Button>
            <Button
              type="button"
              variant={
                formData.requestorType === "co_owner" ? "default" : "outline"
              }
              onClick={() =>
                onFormDataChange((prev) => ({
                  ...prev,
                  requestorType: "co_owner",
                }))
              }
            >
              공동대표
            </Button>
            <Button
              type="button"
              variant={
                formData.requestorType === "staff" ? "default" : "outline"
              }
              onClick={() =>
                onFormDataChange((prev) => ({
                  ...prev,
                  requestorType: "staff",
                }))
              }
            >
              직원
            </Button>
          </div>
        </div>

        <div>
          <Label htmlFor="name">이름</Label>
          <Input
            id="name"
            name="name"
            type="text"
            value={isSocialCompleteMode ? user?.name || "" : formData.name}
            onChange={onFormChange}
            required={!isSocialCompleteMode}
            readOnly={isSocialCompleteMode}
          />
        </div>

        <div>
          <Label htmlFor="email">이메일</Label>
          <Input
            id="email"
            name="email"
            type="email"
            value={isSocialCompleteMode ? user?.email || "" : formData.email}
            onChange={onFormChange}
            required={!isSocialCompleteMode}
            readOnly={isSocialCompleteMode}
          />
        </div>

        {(formData.requestorType === "owner" ||
          formData.requestorType === "co_owner") && (
          <div>
            <Label htmlFor="company">기공소명</Label>
            <Input
              id="company"
              name="company"
              type="text"
              value={formData.company}
              onChange={onFormChange}
              placeholder="예: 서울치과기공소"
              required
            />
          </div>
        )}

        <div>
          <Label htmlFor="phone">전화번호</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            value={formData.phone}
            onChange={onFormChange}
            placeholder="010-0000-0000"
          />
        </div>

        {!isSocialCompleteMode && !isSocialNewMode && (
          <>
            <div>
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                name="password"
                type="password"
                value={formData.password}
                onChange={onFormChange}
                required
                minLength={8}
              />
            </div>

            <div>
              <Label htmlFor="confirmPassword">비밀번호 확인</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={onFormChange}
                required
                minLength={8}
              />
            </div>
          </>
        )}

        <Button
          type="submit"
          className="w-full h-12 flex items-center justify-center text-base"
          disabled={isLoading}
          variant="hero"
        >
          {isLoading
            ? "처리 중..."
            : isSocialCompleteMode
            ? "가입 완료"
            : "회원가입"}
        </Button>

        <div className="text-center text-sm text-muted-foreground">
          이미 계정이 있으신가요?{" "}
          <Button
            variant="link"
            className="p-0 h-auto"
            onClick={onNavigateLogin}
          >
            로그인
          </Button>
        </div>
      </form>
    </>
  );
};
