// related files:
// - web/frontend/src/shared/components/practice/LabBasketTagToolbar.tsx
// - 2026-09-20: 번호표 01–99. 전체 시트 또는 유실분 선택 인쇄.
export type LabBasketTagSheetMode = "full" | "custom";

/** A4 한 장 그리드 — 가로 4 · 세로 9 (99장 → 3페이지) */
export const LAB_BASKET_TAG_COLS = 4;
export const LAB_BASKET_TAG_ROWS = 9;
export const LAB_BASKET_TAGS_PER_PAGE = LAB_BASKET_TAG_COLS * LAB_BASKET_TAG_ROWS;

/** 01–99 (00 제외) */
export const LAB_BASKET_TAG_RE = /^(0[1-9]|[1-9][0-9])$/;

export function normalizeLabBasketTagCode(value: unknown): string {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();
  // 레거시 A–Z / A1–Z9는 무효. 숫자만 허용(1→01 정규화).
  if (/^\d{1,2}$/.test(raw)) {
    const n = Number(raw);
    if (n >= 1 && n <= 99) return String(n).padStart(2, "0");
  }
  return LAB_BASKET_TAG_RE.test(raw) ? raw : "";
}

export function listLabBasketTags(): string[] {
  return Array.from({ length: 99 }, (_, i) => String(i + 1).padStart(2, "0"));
}

export function chunkLabBasketTags(
  tags: string[],
  perPage = LAB_BASKET_TAGS_PER_PAGE,
): string[][] {
  const pages: string[][] = [];
  for (let i = 0; i < tags.length; i += perPage) {
    pages.push(tags.slice(i, i + perPage));
  }
  return pages.length ? pages : [[]];
}

export function labBasketTagSheetCount(): number {
  return listLabBasketTags().length;
}

export function sortLabBasketTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of tags) {
    const code = normalizeLabBasketTagCode(raw);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    normalized.push(code);
  }
  return normalized.sort((a, b) => Number(a) - Number(b));
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildLabBasketTagSheetHtml(
  tagsInput: string[],
  titleLabel = "01–99",
): string {
  const tags = sortLabBasketTags(tagsInput);
  const pages = chunkLabBasketTags(tags);
  const title = `바구니 번호표 (${titleLabel})`;
  const pagesHtml = pages
    .map((pageTags, pageIndex) => {
      const cells = Array.from({ length: LAB_BASKET_TAGS_PER_PAGE }, (_, i) => {
        const code = pageTags[i] || "";
        return code
          ? `<div class="tag"><span>${escapeHtml(code)}</span></div>`
          : `<div class="tag tag-empty" aria-hidden="true"></div>`;
      }).join("");
      return `<section class="sheet" aria-label="페이지 ${pageIndex + 1}">
        <header class="sheet-header">
          <span>${escapeHtml(title)}</span>
          <span>${pageIndex + 1} / ${pages.length}</span>
        </header>
        <div class="grid">${cells}</div>
      </section>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 portrait; margin: 5mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      color: #0f172a;
      font: 11px/1.3 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo",
        "Noto Sans KR", "Segoe UI", sans-serif;
    }
    .sheet {
      width: 100%;
      height: calc(297mm - 10mm);
      max-height: calc(297mm - 10mm);
      padding: 0;
      display: flex;
      flex-direction: column;
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sheet:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .sheet-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      flex: 0 0 auto;
      margin-bottom: 2mm;
      color: #64748b;
      font-size: 9px;
      line-height: 1.2;
    }
    .grid {
      flex: 1 1 auto;
      min-height: 0;
      display: grid;
      grid-template-columns: repeat(${LAB_BASKET_TAG_COLS}, 1fr);
      grid-template-rows: repeat(${LAB_BASKET_TAG_ROWS}, 1fr);
      gap: 2mm;
    }
    .tag {
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1.4px dashed #0ea5e9;
      border-radius: 2mm;
      background: #fff;
      overflow: hidden;
    }
    .tag span {
      font-size: 22pt;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #0369a1;
      font-variant-numeric: tabular-nums;
    }
    .tag-empty {
      border-color: transparent;
      background: transparent;
    }
    @media print {
      .sheet-header { color: #94a3b8; }
    }
  </style>
</head>
<body>
  ${pagesHtml}
</body>
</html>`;
}

/** noopener window.open 빈 탭 방지 — iframe 인쇄 */
export function printLabBasketTagSheet(
  tags: string[],
  titleLabel = "01–99",
): void {
  if (sortLabBasketTags(tags).length === 0) return;

  const html = buildLabBasketTagSheetHtml(tags, titleLabel);
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
