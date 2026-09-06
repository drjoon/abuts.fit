// related files:
// - web/frontend/src/shared/components/business/settings/business/BusinessAddressFields.tsx
// - web/frontend/src/pages/salesTeam/SalesAccountsPage.tsx

const POSTCODE_SCRIPT_SRC =
  "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

let postcodeScriptPromise: Promise<void> | null = null;

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: {
        oncomplete: (data: {
          roadAddress?: string;
          jibunAddress?: string;
          address?: string;
          buildingName?: string;
        }) => void;
      }) => { open?: () => void };
    };
  }
}

function loadPostcodeScript() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.daum?.Postcode) return Promise.resolve();
  if (postcodeScriptPromise) return postcodeScriptPromise;

  postcodeScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = POSTCODE_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("주소 검색 스크립트 로딩 실패"));
    document.body.appendChild(script);
  });

  return postcodeScriptPromise;
}

/** Open Daum Postcode popup; returns road/jibun + optional building as one line. */
export async function openSalesAddressSearch(): Promise<string | null> {
  await loadPostcodeScript();
  if (!window.daum?.Postcode) return null;

  return new Promise((resolve) => {
    const popup = new window.daum.Postcode({
      oncomplete: (data) => {
        const base =
          data.roadAddress || data.jibunAddress || data.address || "";
        const building = String(data.buildingName || "").trim();
        const line =
          building && base && !base.includes(building)
            ? `${base} ${building}`
            : base;
        resolve(line || null);
      },
    });
    popup.open?.();
  });
}
