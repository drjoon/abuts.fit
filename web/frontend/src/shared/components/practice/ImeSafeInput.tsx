import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { Input } from "@/components/ui/input";

// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx

type ImeSafeInputProps = Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  onComposingChange?: (composing: boolean) => void;
};

/**
 * 한글 IME 조합 중에는 로컬 draft만 갱신하고, 부모 value 동기화/상향 onChange는 조합 종료 후로 미룬다.
 * 부모 리렌더(동기화 상태 등)가 조합을 깨지 않게 한다.
 */
export const ImeSafeInput = forwardRef<HTMLInputElement, ImeSafeInputProps>(
  function ImeSafeInput(
    {
      value,
      onChange,
      onComposingChange,
      onCompositionStart,
      onCompositionEnd,
      ...props
    },
    ref,
  ) {
    const [draft, setDraft] = useState(String(value || ""));
    const composingRef = useRef(false);

    useEffect(() => {
      if (composingRef.current) return;
      setDraft(String(value || ""));
    }, [value]);

    return (
      <Input
        {...props}
        ref={ref}
        value={draft}
        onCompositionStart={(e) => {
          composingRef.current = true;
          onComposingChange?.(true);
          onCompositionStart?.(e);
        }}
        onCompositionEnd={(e) => {
          const next = e.currentTarget.value;
          composingRef.current = false;
          setDraft(next);
          onChange(next);
          onComposingChange?.(false);
          onCompositionEnd?.(e);
        }}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          if (!composingRef.current) onChange(next);
        }}
      />
    );
  },
);
