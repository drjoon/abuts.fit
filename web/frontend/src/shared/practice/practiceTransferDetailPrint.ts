// related files:
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/shared/practice/practiceTransferFeeQuote.ts
// - 2026-08-28: 프린트에서 기공비 섹션 제거.
// - 2026-08-28: 프린트 — 기본정보 2열·치식 밀집 표로 1페이지 맞춤.
// - 2026-08-28: 기공소 의뢰상세 A5 프린트 — iframe(noopener 빈 탭 방지).
// - 2026-08-28: 기공소 의뢰상세 A5(절반 용지) 프린트 — 기본정보·치식·메모.
import {
  formatAbutmentSummary,
  formatImplantSummary,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";
import {
  isCustomAbutmentSupportedProsthesisType,
  isMissingToothProsthesisType,
} from "@/shared/practice/usePracticeToothWorkEditor";
import { sortPracticeTransferFeeLines } from "@/shared/practice/practiceTransferFeeQuote";

export type PracticeTransferDetailPrintSummaryItem = {
  label: string;
  value: string;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildToothWorksHtml = (toothWorks: ToothWorkSelection[]) => {
  const rows = sortPracticeTransferFeeLines(
    toothWorks.filter((row) => /^[1-4][1-8]$/.test(String(row.toothNumber || "").trim())),
  );
  if (rows.length === 0) {
    return `<p class="muted">선택된 보철물이 없습니다</p>`;
  }
  const body = rows
    .map((row) => {
      const tooth = String(row.toothNumber || "").trim();
      const type = String(row.prosthesisType || "보철").trim() || "보철";
      const isMissing = isMissingToothProsthesisType(row.prosthesisType);
      const details: string[] = [];
      if (
        !isMissing &&
        isCustomAbutmentSupportedProsthesisType(row.prosthesisType) &&
        row.customAbutment
      ) {
        const implant = formatImplantSummary(row);
        const abutment = formatAbutmentSummary(row);
        if (implant) details.push(implant);
        if (abutment) details.push(`어벗 ${abutment}`);
      }
      return `<tr>
        <td class="tooth-num">${escapeHtml(tooth)}</td>
        <td>${escapeHtml(type)}</td>
        <td class="tooth-detail">${escapeHtml(details.join(" · ") || "—")}</td>
      </tr>`;
    })
    .join("");
  return `<table class="tooth-table">
    <thead>
      <tr><th>치아</th><th>보철</th><th>커스텀어벗</th></tr>
    </thead>
    <tbody>${body}</tbody>
  </table>`;
};

export function printPracticeTransferDetail(params: {
  title?: string;
  summaryItems: PracticeTransferDetailPrintSummaryItem[];
  toothWorks?: ToothWorkSelection[];
  memo?: string;
}): void {
  const title = String(params.title || "의뢰 상세").trim() || "의뢰 상세";
  const summaryItems = params.summaryItems || [];
  const summaryCells = summaryItems
    .map(
      (row) => `<div class="summary-item">
        <span class="label">${escapeHtml(row.label)}</span>
        <span class="value">${escapeHtml(row.value || "-")}</span>
      </div>`,
    )
    .join("");
  const toothHtml = buildToothWorksHtml(
    Array.isArray(params.toothWorks) ? params.toothWorks : [],
  );
  const memoText = String(params.memo || "").trim() || "-";

  // noopener면 window.open이 null을 반환하고 빈 탭만 남는다. iframe 인쇄로 우회.
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A5 portrait; margin: 6mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 6mm;
      color: #0f172a;
      font: 10px/1.35 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo",
        "Noto Sans KR", "Malgun Gothic", sans-serif;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    h2 {
      margin: 8px 0 4px;
      padding-top: 6px;
      border-top: 1px solid #e2e8f0;
      font-size: 11px;
      font-weight: 700;
    }
    h2:first-of-type { border-top: 0; padding-top: 0; margin-top: 0; }
    .summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 14px;
      row-gap: 0;
    }
    .summary-item {
      display: grid;
      grid-template-columns: 5.25rem minmax(0, 1fr);
      gap: 4px;
      padding: 2px 0;
      border-bottom: 1px solid #f1f5f9;
      align-items: start;
    }
    .summary-item .label {
      color: #64748b;
      font-weight: 500;
    }
    .summary-item .value {
      font-weight: 600;
      word-break: break-word;
    }
    table.tooth-table {
      width: 100%;
      border-collapse: collapse;
      font-variant-numeric: tabular-nums;
    }
    table.tooth-table th,
    table.tooth-table td {
      padding: 2px 4px;
      border-bottom: 1px solid #e2e8f0;
      text-align: center;
      vertical-align: middle;
    }
    table.tooth-table th {
      color: #64748b;
      font-size: 9px;
      font-weight: 600;
    }
    table.tooth-table td.tooth-num {
      width: 2.2rem;
      color: #1d4ed8;
      font-weight: 700;
      white-space: nowrap;
    }
    table.tooth-table td.tooth-detail {
      color: #64748b;
      font-size: 9px;
      word-break: break-word;
    }
    .memo {
      margin: 0;
      padding: 5px 8px;
      border-radius: 4px;
      background: #f8fafc;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .muted { margin: 0; color: #94a3b8; }
    @media print {
      body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <h2>기본 정보</h2>
  ${
    summaryCells
      ? `<div class="summary-grid">${summaryCells}</div>`
      : `<p class="muted">-</p>`
  }
  <h2>치식 · 보철물</h2>
  ${toothHtml}
  <h2>의뢰 메모</h2>
  <p class="memo">${escapeHtml(memoText)}</p>
</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDoc = frameWindow?.document;
  if (!frameWindow || !frameDoc) {
    iframe.remove();
    return;
  }

  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  const cleanup = () => {
    iframe.remove();
  };

  const runPrint = () => {
    try {
      frameWindow.focus();
      frameWindow.print();
    } finally {
      setTimeout(cleanup, 1000);
    }
  };

  frameWindow.addEventListener("afterprint", cleanup, { once: true });
  if (frameDoc.readyState === "complete") {
    setTimeout(runPrint, 50);
  } else {
    iframe.addEventListener("load", () => setTimeout(runPrint, 50), { once: true });
  }
}
