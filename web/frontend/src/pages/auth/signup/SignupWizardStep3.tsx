import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SignupWizardStep3Props {
  formData: {
    company: string;
    phone: string;
    requestorType: "" | "owner" | "staff";
  };
  isLoading: boolean;
  onFormChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPrevious: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const SignupWizardStep3 = ({
  formData,
  isLoading,
  onFormChange,
  onPrevious,
  onSubmit,
}: SignupWizardStep3Props) => {
  const handleRequestorTypeChange = (type: "" | "owner" | "staff") => {
    onFormChange({
      target: { name: "requestorType", value: type },
    } as React.ChangeEvent<HTMLInputElement>);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isLoading) {
      e.preventDefault();
      onSubmit(e as any);
    }
  };

  const showCompanyField = formData.requestorType === "owner";

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <div className="space-y-3">
        <Label className="text-sm font-medium">직책</Label>
        <div className="grid grid-cols-2 gap-2">
          {(["owner", "staff"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => handleRequestorTypeChange(type)}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                formData.requestorType === type
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
              disabled={isLoading}
            >
              {type === "owner" ? "대표" : "직원"}
            </button>
          ))}
        </div>
      </div>

      {showCompanyField && (
        <div className="space-y-2">
          <Label htmlFor="company" className="text-sm font-medium">
            기공소명
          </Label>
          <Input
            id="company"
            name="company"
            type="text"
            placeholder="예: 서울치과기공소"
            value={formData.company}
            onChange={onFormChange}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className="h-10"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="phone" className="text-sm font-medium">
          휴대폰
        </Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          placeholder="010-0000-0000"
          value={formData.phone}
          onChange={onFormChange}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
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
          {isLoading ? "처리 중..." : "회원가입"}
        </Button>
      </div>
    </form>
  );
};
