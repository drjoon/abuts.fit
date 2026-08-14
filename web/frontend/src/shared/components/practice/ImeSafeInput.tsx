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

const isImeEvent = (e: { nativeEvent: Event }) => {
  const ne = e.nativeEvent as Event & { isComposing?: boolean; keyCode?: number };
  // keyCode 229 = IME processing. compositionStart보다 key/change가 먼저 오는 브라우저 대비.
  return Boolean(ne.isComposing) || ne.keyCode === 229;
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
      onKeyDown,
      ...props
    },
    ref,
  ) {
    const [draft, setDraft] = useState(String(value || ""));
    const composingRef = useRef(false);

    const setComposing = (next: boolean) => {
      if (composingRef.current === next) return;
      composingRef.current = next;
      onComposingChange?.(next);
    };

    useEffect(() => {
      if (composingRef.current) return;
      setDraft(String(value || ""));
    }, [value]);

    return (
      <Input
        {...props}
        ref={ref}
        value={draft}
        onKeyDown={(e) => {
          // compositionStart보다 keydown(229)이 먼저인 경우가 있어 여기서 조합 시작을 잡는다.
          if (isImeEvent(e)) setComposing(true);
          onKeyDown?.(e);
        }}
        onCompositionStart={(e) => {
          setComposing(true);
          onCompositionStart?.(e);
        }}
        onCompositionEnd={(e) => {
          const next = e.currentTarget.value;
          setComposing(false);
          setDraft(next);
          onChange(next);
          onCompositionEnd?.(e);
        }}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          // compositionStart 전에 Latin(r/rh) onChange가 오는 경우가 있어 native isComposing도 본다.
          if (composingRef.current || isImeEvent(e)) {
            setComposing(true);
            return;
          }
          onChange(next);
        }}
      />
    );
  },
);
