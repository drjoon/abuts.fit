/** 커스텀어벗 선택. 마지막 치아가 패널·검볼의 기준이다. */

export function nextAbutmentSelection(
  prev: readonly string[],
  tooth: string,
  additive: boolean,
): string[] {
  if (!additive) return [tooth];
  if (!prev.includes(tooth)) return [...prev, tooth];
  if (prev.length <= 1) return [...prev];
  return prev.filter((item) => item !== tooth);
}

/** 패널에서 고친 치아가 선택 안에 있으면 선택 전체, 아니면 그 치아만. */
export function abutmentEditTargets(selected: readonly string[], editedTooth: string): string[] {
  return selected.includes(editedTooth) ? [...selected] : [editedTooth];
}

/** 검볼을 끈 치아가 다중 선택 안이면 선택 전체가 같은 만큼 움직인다. */
export function gumballGroupTeeth(selected: readonly string[], lead: string): string[] {
  return selected.includes(lead) && selected.length > 1 ? [...selected] : [lead];
}
