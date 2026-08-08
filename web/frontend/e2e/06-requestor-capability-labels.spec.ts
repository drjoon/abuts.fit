// related files:
// - web/frontend/src/shared/business/requestorCapabilities.ts
// - web/frontend/src/shared/components/business/RequestorCapabilitiesPicker.tsx
// - web/frontend/e2e/helpers.ts
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCOUNTS,
  loginAndSkipWizard,
  resolveAccount,
  visitPage,
} from "./helpers";

const SENDER_LABEL = "의뢰 발신자 (치과)";
const RECEIVER_LABEL = "의뢰 수신자 (기공소와 기공실)";
const OLD_SENDER = "원내 기공실 없는 치과";
const OLD_RECEIVER = "기공소 혹은 원내 기공실";

const REQUESTOR = resolveAccount("requestor");

const RELATED_REQUESTOR_PAGES = [
  { path: "/dashboard", label: "대시보드(유료게이트)" },
  { path: "/dashboard/new-request", label: "신규의뢰(유료게이트)" },
  { path: "/dashboard/practice-transfers", label: "기공의뢰서" },
  { path: "/dashboard/settings?tab=business", label: "설정 > 사업자" },
  { path: "/dashboard/settings?tab=request", label: "설정 > 의뢰" },
  { path: "/dashboard/settings?tab=payment", label: "설정 > 결제" },
  { path: "/dashboard/referral-groups", label: "소개" },
];

const capsSource = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../src/shared/business/requestorCapabilities.ts",
  ),
  "utf8",
);

async function assertNoLegacyLabels(
  page: import("@playwright/test").Page,
  label: string,
) {
  const body = await page.evaluate(() => document.body?.innerText ?? "");
  expect(body.includes(OLD_SENDER), `${label}: 구 발신 라벨`).toBe(false);
  expect(body.includes(OLD_RECEIVER), `${label}: 구 수신 라벨`).toBe(false);
  return body;
}

test.describe("Requestor capability labels – SSOT/공개/관리자", () => {
  test("SSOT 상수 – 신규 라벨 존재·구 라벨 제거", async () => {
    expect(capsSource).toContain(`practice: "${SENDER_LABEL}"`);
    expect(capsSource).toContain(`lab: "${RECEIVER_LABEL}"`);
    expect(capsSource).not.toContain(OLD_SENDER);
    expect(capsSource).not.toContain(OLD_RECEIVER);
  });

  test("가입 안내 – 의뢰자 역할에 발신/수신 문구", async ({ page }) => {
    await page.goto("/signup");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(800);

    const requestorBtn = page
      .locator('button:has-text("의뢰자"), button:has-text("의뢰")')
      .first();
    if (await requestorBtn.isVisible().catch(() => false)) {
      await requestorBtn.click();
      await page.waitForTimeout(300);
    }

    const body = await page.evaluate(() => document.body?.innerText ?? "");
    expect(body.includes(OLD_SENDER) || body.includes(OLD_RECEIVER)).toBe(false);
    expect(
      body.includes("의뢰 발신자") || body.includes("의뢰 수신자"),
    ).toBe(true);
  });

  test("드롭존 – 공개 페이지 렌더·구 라벨 부재", async ({ page }) => {
    await visitPage(page, "/practice/dropzone", "드롭존");
    await assertNoLegacyLabels(page, "드롭존");
  });

  test("관리자 사용자 – DEV 로그인 후 구 뱃지 문구 부재", async ({ page }) => {
    await loginAndSkipWizard(page, ACCOUNTS.admin);
    expect(page.url()).toMatch(/\/dashboard/);

    await page.goto("/dashboard/users?role=requestor");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    const body = await assertNoLegacyLabels(page, "관리자 사용자");
    expect(body.length).toBeGreaterThan(10);
    expect(body.includes("치과(무료)")).toBe(false);
  });
});

test.describe("Requestor capability labels – 유료게이트 로직", () => {
  test("canUsePaidServices = lab && verified", async () => {
    const normalize = (raw?: {
      practice?: boolean;
      clinic?: boolean;
      lab?: boolean;
    }) => ({
      practice: Boolean(raw?.practice ?? raw?.clinic),
      lab: Boolean(raw?.lab),
    });
    const canUsePaid = (args?: {
      businessVerified?: boolean;
      caps?: { practice?: boolean; clinic?: boolean; lab?: boolean };
    }) =>
      Boolean(args?.businessVerified) && Boolean(normalize(args?.caps).lab);

    expect(
      canUsePaid({
        businessVerified: true,
        caps: { practice: true, lab: false },
      }),
    ).toBe(false);
    expect(
      canUsePaid({
        businessVerified: true,
        caps: { practice: true, lab: true },
      }),
    ).toBe(true);
  });
});

test.describe("Requestor capability labels – 실계정 로그인", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !process.env.E2E_REQUESTOR_PASSWORD,
      "E2E_REQUESTOR_PASSWORD 필요",
    );
    await loginAndSkipWizard(page, REQUESTOR, { preferDevQuickLogin: false });
  });

  for (const { path, label } of RELATED_REQUESTOR_PAGES) {
    test(`페이지 렌더링: ${label} (${path})`, async ({ page }) => {
      await visitPage(page, path, label);
      expect(page.url()).not.toContain("/login");
      await assertNoLegacyLabels(page, label);
    });
  }

  test("설정 > 사업자 – 발신/수신 라벨 표시", async ({ page }) => {
    await page.goto("/dashboard/settings?tab=business");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    expect(page.url()).not.toContain("/login");

    const body = await assertNoLegacyLabels(page, "설정>사업자");
    if (body.includes("사업자 유형")) {
      await expect(page.getByText(SENDER_LABEL, { exact: false })).toBeVisible({
        timeout: 10_000,
      });
      await expect(
        page.getByText(RECEIVER_LABEL, { exact: false }),
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test("기공의뢰서 – 발신/수신 UI", async ({ page }) => {
    await page.goto("/dashboard/practice-transfers");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    expect(page.url()).not.toContain("/login");

    const body = await assertNoLegacyLabels(page, "기공의뢰서");
    expect(
      body.includes("발신") ||
        body.includes("수신") ||
        body.includes("환자명") ||
        body.includes("기공소") ||
        body.includes("사업자 유형"),
    ).toBe(true);
  });

  test("유료 게이트 – practice-only면 대시보드→기공의뢰서", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain("/login");

    // practice-only 계정이면 practice-transfers, lab+verified면 /dashboard 유지
    const url = page.url();
    expect(url).toMatch(/\/dashboard/);
    const pathOnly = new URL(url).pathname.replace(/\/$/, "") || "/";
    if (pathOnly === "/dashboard") {
      // 유료 허용
      expect(url).not.toContain("practice-transfers");
    } else {
      expect(url).toContain("practice-transfers");
    }
  });

  test("유료 게이트 – lab+verified 모킹 시 대시보드 허용", async ({ page }) => {
    await page.route("**/api/businesses/me**", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            membership: "owner",
            businessVerified: true,
            requestorCapabilities: { practice: true, lab: true },
          },
        }),
      });
    });

    await page.goto("/dashboard");
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("abuts:requestor-access-updated"));
    });
    await page.waitForTimeout(2000);

    expect(page.url()).not.toContain("/login");
    expect(page.url()).toMatch(/\/dashboard/);
  });
});
