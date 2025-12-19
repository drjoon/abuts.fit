import type React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SignupSocialWizardStep1Props {
  formData: {
    name: string;
    email: string;
  };
  socialInfo: {
    name: string;
    email: string;
  } | null;
  isLoading: boolean;
  onFormChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPrevious: () => void;
  onNext: () => void;
  toast: (options: any) => void;
}

export const SignupSocialWizardStep1 = ({
  formData,
  socialInfo,
  isLoading,
  onFormChange,
  onPrevious,
  onNext,
  toast,
}: SignupSocialWizardStep1Props) => {
  const handleNext = () => {
    const name = String(formData.name || "").trim();
    const email = String(formData.email || "")
      .trim()
      .toLowerCase();

    if (!name) {
      toast({
        title: "오류",
        description: "이름을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({
        title: "오류",
        description: "이메일 형식을 확인해주세요.",
        variant: "destructive",
      });
      return;
    }

    onNext();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isLoading) {
      e.preventDefault();
      handleNext();
    }
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        handleNext();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="name" className="text-sm font-medium">
          이름
        </Label>
        <Input
          id="name"
          name="name"
          type="text"
          placeholder="예: 홍길동"
          value={formData.name}
          onChange={onFormChange}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          autoComplete="name"
          className="h-10"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-medium">
          이메일
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="example@email.com"
          value={formData.email}
          onChange={onFormChange}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          autoComplete="email"
          className="h-10"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={isLoading}
          onClick={onPrevious}
          className="h-10"
        >
          이전
        </Button>
        <Button
          type="submit"
          variant="hero"
          disabled={isLoading}
          className="h-10"
        >
          다음
        </Button>
      </div>
    </form>
  );
};
