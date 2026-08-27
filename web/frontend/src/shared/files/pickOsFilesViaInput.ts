// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferFileDropTarget.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - 2026-08-27: Windows — 파일창 open 직후 focus가 먼저 오면 400ms에 빈 배열로 resolve되던 race 수정.

type PickOsFilesOptions = {
  accept?: string;
  multiple?: boolean;
};

/**
 * OS 파일 선택창을 연다. change/cancel을 우선하고, 취소 폴백은 blur→focus 이후에만 동작한다.
 * (Windows: dialog open 시 focus가 먼저 오면 premature resolve 방지)
 */
export function pickOsFilesViaInput(
  opts?: PickOsFilesOptions,
): Promise<File[]> {
  const accept = String(opts?.accept || "").trim();
  const multiple = opts?.multiple !== false;

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (accept) input.accept = accept;
    input.multiple = multiple;
    input.style.display = "none";

    let settled = false;
    let sawWindowBlur = false;

    const cleanup = () => {
      input.removeEventListener("change", onChange);
      input.removeEventListener("cancel", onCancel);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
      input.remove();
    };

    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(files);
    };

    const onChange = () => {
      finish(Array.from(input.files || []));
    };

    const onCancel = () => {
      finish([]);
    };

    const onWindowBlur = () => {
      sawWindowBlur = true;
    };

    const onWindowFocus = () => {
      if (!sawWindowBlur) return;
      window.setTimeout(() => {
        if (!settled) finish(Array.from(input.files || []));
      }, 600);
    };

    input.addEventListener("change", onChange);
    input.addEventListener("cancel", onCancel);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
    document.body.appendChild(input);
    input.click();
  });
}
