// change-log:
// - 2026-08-17: 역할 선택 공통 Select. 사업영역 주체·가입 화면에서 재사용.
// related files:
// - web/frontend/src/shared/types/role.ts
// - web/frontend/src/pages/admin/partners/DepartmentRoster.tsx
// - web/frontend/src/components/ui/select.tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAppUserRoleLabel } from "@/shared/types/role";
import { cn } from "@/shared/ui/cn";

export function RoleSelect({
  value,
  onValueChange,
  roles,
  exclude = [],
  placeholder = "역할 선택",
  disabled = false,
  getLabel = getAppUserRoleLabel,
  triggerClassName,
}: {
  value?: string;
  onValueChange: (role: string) => void;
  roles: readonly string[];
  exclude?: readonly string[];
  placeholder?: string;
  disabled?: boolean;
  getLabel?: (role: string) => string;
  triggerClassName?: string;
}) {
  const options = roles.filter(
    (role) => role === value || !exclude.includes(role),
  );
  const selected = value && roles.includes(value) ? value : undefined;

  return (
    <Select
      value={selected}
      onValueChange={onValueChange}
      disabled={disabled || options.length === 0}
    >
      <SelectTrigger
        className={cn(
          "h-8 min-w-[7rem] rounded-lg border-slate-200 bg-slate-50/70 px-2 text-[13px] font-semibold",
          triggerClassName,
        )}
        aria-label="역할"
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((role) => (
          <SelectItem key={role} value={role}>
            {getLabel(role)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
