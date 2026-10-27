import type { KeyboardEvent } from "react";

/** 한글 조합 중 Enter(확정)는 다음 칸으로 넘기지 않는다. */
export function isConfirmingEnter(event: KeyboardEvent): boolean {
  if (event.key !== "Enter") return false;
  if (event.nativeEvent.isComposing) return false;
  if (event.nativeEvent.keyCode === 229) return false;
  return true;
}

export function focusOnEnter(
  event: KeyboardEvent<HTMLElement>,
  next: { focus: () => void } | null | undefined,
): boolean {
  if (!isConfirmingEnter(event)) return false;
  event.preventDefault();
  next?.focus();
  return true;
}
