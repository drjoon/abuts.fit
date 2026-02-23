import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SignupWizardAccountStepProps {
  formData: {
    name: string;
    password: string;
    confirmPassword: string;
  };
  isLoading: boolean;
  onFormChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPrevious: () => void;
  onNext: () => void;
  isStrongPassword: (password: string) => boolean;
  toast: (options: any) => void;
}

export const SignupWizardAccountStep = ({
  formData,
  isLoading,
  onFormChange,
  onPrevious,
  onNext,
  isStrongPassword,
  toast,
}: SignupWizardAccountStepProps) => {
  const handleNext = () => {
    const name = String(formData.name || "").trim();
    const password = String(formData.password || "");
    const confirm = String(formData.confirmPassword || "");

    if (!name) {
      toast({
        title: "오류",
        description: "이름을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!isStrongPassword(password)) {
      toast({
        title: "오류",
        description: "비밀번호는 10자 이상이며 특수문자를 포함해야 합니다.",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirm) {
      toast({
        title: "오류",
        description: "비밀번호가 일치하지 않습니다.",
        variant: "destructive",
      });
      return;
    }

    onNext();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isLoading) {
      handleNext();
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="name" className="text-sm font-medium text-white/80">
          이름
        </Label>
        <Input
          id="name"
          name="name"
          type="text"
          placeholder="예: 홍길동"
          value={formData.name}
          onChange={onFormChange}
          disabled={isLoading}
          autoComplete="name"
          className="h-10 border-white/10 bg-white/5 text-white placeholder:text-white/40"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm font-medium text-white/80">
          비밀번호
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="10자 이상, 특수문자 포함"
          value={formData.password}
          onChange={onFormChange}
          disabled={isLoading}
          autoComplete="new-password"
          className="h-10 border-white/10 bg-white/5 text-white placeholder:text-white/40"
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="confirmPassword"
          className="text-sm font-medium text-white/80"
        >
          비밀번호 확인
        </Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          placeholder="비밀번호를 다시 입력해주세요"
          value={formData.confirmPassword}
          onChange={onFormChange}
          disabled={isLoading}
          autoComplete="new-password"
          className="h-10 border-white/10 bg-white/5 text-white placeholder:text-white/40"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={isLoading}
          onClick={onPrevious}
          className="h-10 border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
        >
          이전
        </Button>
        <Button type="submit" variant="hero" disabled={isLoading} className="h-10">
          다음
        </Button>
      </div>
    </form>
  );
};
